//! The Web Audio bridge: the Rust half of `src/native/webAudio/`. The website's sound code builds
//! ordinary Web Audio graphs (oscillators, gains, samples through a compressor and a reverb). In
//! the desktop app those calls land on a JavaScript stand-in for `AudioContext`, which batches them
//! into ops and sends them here, where the same graph is built in `web-audio-api` (a Rust
//! implementation of the Web Audio spec) and played through one native output.
//!
//! JavaScript owns the ids (nodes and buffers share one counter), keeps each node's state for its
//! own getters, and can send its live graph again. That's how reopening the output works (another
//! device or buffer size, or the device went away): the context starts from scratch and JavaScript
//! replays what's still alive. Times stay continuous across that, because everything JavaScript
//! sees is context time + `offset`.

use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager};
use web_audio_api::context::{
    AudioContext, AudioContextLatencyCategory, AudioContextOptions, AudioContextState, BaseAudioContext,
    OfflineAudioContext,
};
use web_audio_api::node::{
    AnalyserNode, AudioBufferSourceNode, AudioDestinationNode, AudioNode, AudioScheduledSourceNode,
    BiquadFilterNode, BiquadFilterType, ChannelCountMode, ChannelInterpretation, ChannelMergerNode,
    ChannelSplitterNode, ConstantSourceNode, ConvolverNode, DelayNode, DynamicsCompressorNode, GainNode,
    OscillatorNode, OscillatorType, OverSampleType, StereoPannerNode, WaveShaperNode,
};
use web_audio_api::worklet::{
    AudioParamValues, AudioWorkletGlobalScope, AudioWorkletNode, AudioWorkletNodeOptions,
    AudioWorkletProcessor,
};
use web_audio_api::{AudioBuffer, AudioParam, PeriodicWaveOptions};

use crate::audio;

/// The destination's id on both sides; JavaScript's own ids start at 1.
const DESTINATION: u32 = 0;
/// Buffer size when the chip says "default" (0).
const DEFAULT_BUFFER: u32 = 256;
/// The clock not moving for this long while the context says it's running means the device went
/// away (unplugged): the next sound reopens the output.
const STALL: Duration = Duration::from_millis(1500);

// ---------------------------------------------------------------------------------------------
// Ops (what JavaScript sends)

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Kind {
    Gain,
    Oscillator,
    BufferSource,
    ConstantSource,
    Compressor,
    Convolver,
    Analyser,
    Splitter,
    Merger,
    Biquad,
    Delay,
    StereoPanner,
    WaveShaper,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Op {
    /// `arg`: the splitter's outputs, the merger's inputs, or the delay's longest delay.
    Create {
        id: u32,
        kind: Kind,
        arg: Option<f64>,
    },
    /// JavaScript garbage-collected the node: let it go once it's silent.
    Free {
        id: u32,
    },
    FreeBuffer {
        id: u32,
    },
    Connect {
        from: u32,
        to: u32,
        #[serde(default)]
        output: u32,
        #[serde(default)]
        input: u32,
        param: Option<String>,
    },
    /// Whatever isn't given matches everything (`disconnect()` has none of them).
    Disconnect {
        from: u32,
        to: Option<u32>,
        output: Option<u32>,
        input: Option<u32>,
        param: Option<String>,
    },
    Channels {
        id: u32,
        count: Option<usize>,
        mode: Option<String>,
        interpretation: Option<String>,
    },
    /// A plain attribute: `type`, `loop`, `loopStart`, `loopEnd`, `normalize`, `fftSize`, ...
    Set {
        id: u32,
        key: String,
        value: Value,
    },
    Buffer {
        id: u32,
        buffer: Option<u32>,
    },
    Wave {
        id: u32,
        real: Vec<f32>,
        imag: Vec<f32>,
        normalize: bool,
    },
    Curve {
        id: u32,
        curve: Option<Vec<f32>>,
    },
    Param {
        id: u32,
        name: String,
        call: ParamCall,
    },
    Start {
        id: u32,
        when: f64,
        offset: Option<f64>,
        duration: Option<f64>,
    },
    Stop {
        id: u32,
        when: f64,
    },
    Suspend,
    Resume,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "fn", rename_all = "camelCase")]
pub enum ParamCall {
    /// `param.value = x`
    Value {
        value: f32,
    },
    SetValueAtTime {
        value: f32,
        time: f64,
    },
    LinearRampToValueAtTime {
        value: f32,
        time: f64,
    },
    ExponentialRampToValueAtTime {
        value: f32,
        time: f64,
    },
    SetTargetAtTime {
        value: f32,
        time: f64,
        tc: f64,
    },
    SetValueCurveAtTime {
        values: Vec<f32>,
        time: f64,
        duration: f64,
    },
    CancelScheduledValues {
        time: f64,
    },
    CancelAndHoldAtTime {
        time: f64,
    },
}

// ---------------------------------------------------------------------------------------------
// The graph (generic so the tests can render it offline)

// One per JS node, kept in a map; boxing the big ones would only add a pointer hop per op.
#[allow(clippy::large_enum_variant)]
enum Node {
    Destination(AudioDestinationNode),
    Gain(GainNode),
    Oscillator(OscillatorNode),
    BufferSource(AudioBufferSourceNode),
    ConstantSource(ConstantSourceNode),
    Compressor(DynamicsCompressorNode),
    Convolver(ConvolverNode),
    Analyser(AnalyserNode),
    Splitter(ChannelSplitterNode),
    Merger(ChannelMergerNode),
    Biquad(BiquadFilterNode),
    Delay(DelayNode),
    StereoPanner(StereoPannerNode),
    WaveShaper(WaveShaperNode),
}

impl Node {
    fn audio(&self) -> &dyn AudioNode {
        match self {
            Node::Destination(n) => n,
            Node::Gain(n) => n,
            Node::Oscillator(n) => n,
            Node::BufferSource(n) => n,
            Node::ConstantSource(n) => n,
            Node::Compressor(n) => n,
            Node::Convolver(n) => n,
            Node::Analyser(n) => n,
            Node::Splitter(n) => n,
            Node::Merger(n) => n,
            Node::Biquad(n) => n,
            Node::Delay(n) => n,
            Node::StereoPanner(n) => n,
            Node::WaveShaper(n) => n,
        }
    }

    fn param(&self, name: &str) -> Option<&AudioParam> {
        Some(match (self, name) {
            (Node::Gain(n), "gain") => n.gain(),
            (Node::Oscillator(n), "frequency") => n.frequency(),
            (Node::Oscillator(n), "detune") => n.detune(),
            (Node::BufferSource(n), "playbackRate") => n.playback_rate(),
            (Node::BufferSource(n), "detune") => n.detune(),
            (Node::ConstantSource(n), "offset") => n.offset(),
            (Node::Compressor(n), "threshold") => n.threshold(),
            (Node::Compressor(n), "knee") => n.knee(),
            (Node::Compressor(n), "ratio") => n.ratio(),
            (Node::Compressor(n), "attack") => n.attack(),
            (Node::Compressor(n), "release") => n.release(),
            (Node::Biquad(n), "frequency") => n.frequency(),
            (Node::Biquad(n), "detune") => n.detune(),
            (Node::Biquad(n), "Q") => n.q(),
            (Node::Biquad(n), "gain") => n.gain(),
            (Node::Delay(n), "delayTime") => n.delay_time(),
            (Node::StereoPanner(n), "pan") => n.pan(),
            _ => return None,
        })
    }

    fn is_source(&self) -> bool {
        matches!(self, Node::Oscillator(_) | Node::BufferSource(_) | Node::ConstantSource(_))
    }
}

/// One connection. Kept on this side because `web-audio-api` doesn't ignore a repeated
/// `connect()` the way browsers do (it would double the signal), and so disconnects can be exact.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
struct Edge {
    from: u32,
    output: u32,
    to: u32,
    input: Input,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
enum Input {
    Index(u32),
    Param(String),
}

pub struct Graph<C: BaseAudioContext> {
    ctx: C,
    nodes: HashMap<u32, Node>,
    edges: HashSet<Edge>,
    /// Sources that were started (only those can be stopped).
    started: HashSet<u32>,
    /// Seconds JavaScript sees = context seconds + this.
    offset: f64,
    ended: mpsc::Sender<u32>,
}

fn json_f64(value: &Value) -> Option<f64> {
    value.as_f64()
}

impl<C: BaseAudioContext> Graph<C> {
    fn new(ctx: C, offset: f64, ended: mpsc::Sender<u32>) -> Self {
        let mut nodes = HashMap::new();
        nodes.insert(DESTINATION, Node::Destination(ctx.destination()));
        Self { ctx, nodes, edges: HashSet::new(), started: HashSet::new(), offset, ended }
    }

    /// The clock as JavaScript sees it.
    fn now(&self) -> f64 {
        self.ctx.current_time() + self.offset
    }

    /// Applies one op. `web-audio-api` panics where the spec throws; JavaScript throws the usual
    /// exceptions itself before sending, and anything it misses is logged instead of crashing.
    fn apply(&mut self, op: Op, buffers: &HashMap<u32, AudioBuffer>) {
        let description = format!("{op:?}");
        if catch_unwind(AssertUnwindSafe(|| self.apply_op(op, buffers))).is_err() {
            eprintln!("audio bridge: ignored an op the engine refused: {description:.200}");
        }
    }

    fn apply_op(&mut self, op: Op, buffers: &HashMap<u32, AudioBuffer>) {
        let offset = self.offset;
        // Context seconds, never negative: something scheduled before the output was reopened
        // just plays now.
        let at = |time: f64| (time - offset).max(0.0);
        match op {
            Op::Create { id, kind, arg } => {
                // Replays resend every live node; one that already exists stays as it is.
                if self.nodes.contains_key(&id) {
                    return;
                }
                let ctx = &self.ctx;
                let node = match kind {
                    Kind::Gain => Node::Gain(ctx.create_gain()),
                    Kind::Oscillator => Node::Oscillator(ctx.create_oscillator()),
                    Kind::BufferSource => Node::BufferSource(ctx.create_buffer_source()),
                    Kind::ConstantSource => Node::ConstantSource(ctx.create_constant_source()),
                    Kind::Compressor => Node::Compressor(ctx.create_dynamics_compressor()),
                    Kind::Convolver => Node::Convolver(ctx.create_convolver()),
                    Kind::Analyser => Node::Analyser(ctx.create_analyser()),
                    Kind::Splitter => {
                        Node::Splitter(ctx.create_channel_splitter(arg.unwrap_or(6.0) as usize))
                    }
                    Kind::Merger => Node::Merger(ctx.create_channel_merger(arg.unwrap_or(6.0) as usize)),
                    Kind::Biquad => Node::Biquad(ctx.create_biquad_filter()),
                    Kind::Delay => Node::Delay(ctx.create_delay(arg.unwrap_or(1.0))),
                    Kind::StereoPanner => Node::StereoPanner(ctx.create_stereo_panner()),
                    Kind::WaveShaper => Node::WaveShaper(ctx.create_wave_shaper()),
                };
                let ended = self.ended.clone();
                let report = move |_| {
                    let _ = ended.send(id);
                };
                match &node {
                    Node::Oscillator(n) => n.set_onended(report),
                    Node::BufferSource(n) => n.set_onended(report),
                    Node::ConstantSource(n) => n.set_onended(report),
                    _ => {}
                }
                self.nodes.insert(id, node);
            }
            Op::Free { id } => self.forget(id),
            Op::FreeBuffer { .. } | Op::Suspend | Op::Resume => {}
            Op::Connect { from, to, output, input, param } => {
                let edge = Edge { from, output, to, input: param.map_or(Input::Index(input), Input::Param) };
                let (Some(src), Some(dest)) = (self.nodes.get(&from), self.nodes.get(&to)) else { return };
                if self.edges.contains(&edge) {
                    return;
                }
                match &edge.input {
                    Input::Index(input) => {
                        src.audio().connect_from_output_to_input(
                            dest.audio(),
                            output as usize,
                            *input as usize,
                        );
                    }
                    Input::Param(name) => {
                        let Some(param) = dest.param(name) else { return };
                        src.audio().connect_from_output_to_input(param, output as usize, 0);
                    }
                }
                self.edges.insert(edge);
            }
            Op::Disconnect { from, to, output, input, param } => {
                let matching: Vec<Edge> = self
                    .edges
                    .iter()
                    .filter(|e| {
                        e.from == from
                            && to.is_none_or(|to| e.to == to)
                            && output.is_none_or(|o| e.output == o)
                            && match (&e.input, &param) {
                                (Input::Param(name), Some(wanted)) => name == wanted,
                                // `disconnect(node)` leaves connections into its params alone.
                                (Input::Param(_), None) => to.is_none(),
                                (Input::Index(i), None) => input.is_none_or(|wanted| *i == wanted),
                                (Input::Index(_), Some(_)) => false,
                            }
                    })
                    .cloned()
                    .collect();
                let Some(src) = self.nodes.get(&from) else { return };
                for edge in matching {
                    self.edges.remove(&edge);
                    let Some(dest) = self.nodes.get(&edge.to) else { continue };
                    match &edge.input {
                        Input::Index(i) => src.audio().disconnect_dest_from_output_to_input(
                            dest.audio(),
                            edge.output as usize,
                            *i as usize,
                        ),
                        Input::Param(name) => {
                            if let Some(param) = dest.param(name) {
                                src.audio().disconnect_dest_from_output(param, edge.output as usize);
                            }
                        }
                    }
                }
            }
            Op::Channels { id, count, mode, interpretation } => {
                let Some(node) = self.nodes.get(&id) else { return };
                let node = node.audio();
                if let Some(count) = count {
                    node.set_channel_count(count);
                }
                match mode.as_deref() {
                    Some("max") => node.set_channel_count_mode(ChannelCountMode::Max),
                    Some("clamped-max") => node.set_channel_count_mode(ChannelCountMode::ClampedMax),
                    Some("explicit") => node.set_channel_count_mode(ChannelCountMode::Explicit),
                    _ => {}
                }
                match interpretation.as_deref() {
                    Some("speakers") => node.set_channel_interpretation(ChannelInterpretation::Speakers),
                    Some("discrete") => node.set_channel_interpretation(ChannelInterpretation::Discrete),
                    _ => {}
                }
            }
            Op::Set { id, key, value } => {
                let Some(node) = self.nodes.get_mut(&id) else { return };
                match (node, key.as_str()) {
                    (Node::Oscillator(n), "type") => {
                        let wave = match value.as_str() {
                            Some("square") => OscillatorType::Square,
                            Some("sawtooth") => OscillatorType::Sawtooth,
                            Some("triangle") => OscillatorType::Triangle,
                            Some("sine") => OscillatorType::Sine,
                            _ => return,
                        };
                        n.set_type(wave);
                    }
                    (Node::BufferSource(n), "loop") => n.set_loop(value.as_bool().unwrap_or(false)),
                    (Node::BufferSource(n), "loopStart") => n.set_loop_start(json_f64(&value).unwrap_or(0.0)),
                    (Node::BufferSource(n), "loopEnd") => n.set_loop_end(json_f64(&value).unwrap_or(0.0)),
                    (Node::Convolver(n), "normalize") => n.set_normalize(value.as_bool().unwrap_or(true)),
                    (Node::Analyser(n), "fftSize") => {
                        n.set_fft_size(json_f64(&value).unwrap_or(2048.0) as usize)
                    }
                    (Node::Analyser(n), "smoothingTimeConstant") => {
                        n.set_smoothing_time_constant(json_f64(&value).unwrap_or(0.8))
                    }
                    (Node::Analyser(n), "minDecibels") => {
                        n.set_min_decibels(json_f64(&value).unwrap_or(-100.0))
                    }
                    (Node::Analyser(n), "maxDecibels") => {
                        n.set_max_decibels(json_f64(&value).unwrap_or(-30.0))
                    }
                    (Node::Biquad(n), "type") => {
                        let kind = match value.as_str() {
                            Some("lowpass") => BiquadFilterType::Lowpass,
                            Some("highpass") => BiquadFilterType::Highpass,
                            Some("bandpass") => BiquadFilterType::Bandpass,
                            Some("lowshelf") => BiquadFilterType::Lowshelf,
                            Some("highshelf") => BiquadFilterType::Highshelf,
                            Some("peaking") => BiquadFilterType::Peaking,
                            Some("notch") => BiquadFilterType::Notch,
                            Some("allpass") => BiquadFilterType::Allpass,
                            _ => return,
                        };
                        n.set_type(kind);
                    }
                    (Node::WaveShaper(n), "oversample") => n.set_oversample(match value.as_str() {
                        Some("2x") => OverSampleType::X2,
                        Some("4x") => OverSampleType::X4,
                        _ => OverSampleType::None,
                    }),
                    _ => {}
                }
            }
            Op::Buffer { id, buffer } => {
                let Some(buffer) = buffer.and_then(|b| buffers.get(&b)).cloned() else { return };
                match self.nodes.get_mut(&id) {
                    Some(Node::BufferSource(n)) => n.set_buffer(buffer),
                    Some(Node::Convolver(n)) => n.set_buffer(buffer),
                    _ => {}
                }
            }
            Op::Wave { id, real, imag, normalize } => {
                let wave = self.ctx.create_periodic_wave(PeriodicWaveOptions {
                    real: Some(real),
                    imag: Some(imag),
                    disable_normalization: !normalize,
                });
                if let Some(Node::Oscillator(n)) = self.nodes.get_mut(&id) {
                    n.set_periodic_wave(wave);
                }
            }
            Op::Curve { id, curve } => {
                if let (Some(Node::WaveShaper(n)), Some(curve)) = (self.nodes.get_mut(&id), curve) {
                    n.set_curve(curve);
                }
            }
            Op::Param { id, name, call } => {
                let Some(param) = self.nodes.get(&id).and_then(|n| n.param(&name)) else { return };
                match call {
                    ParamCall::Value { value } => {
                        param.set_value(value);
                    }
                    ParamCall::SetValueAtTime { value, time } => {
                        param.set_value_at_time(value, at(time));
                    }
                    ParamCall::LinearRampToValueAtTime { value, time } => {
                        param.linear_ramp_to_value_at_time(value, at(time));
                    }
                    ParamCall::ExponentialRampToValueAtTime { value, time } => {
                        param.exponential_ramp_to_value_at_time(value, at(time));
                    }
                    ParamCall::SetTargetAtTime { value, time, tc } => {
                        param.set_target_at_time(value, at(time), tc);
                    }
                    ParamCall::SetValueCurveAtTime { values, time, duration } => {
                        param.set_value_curve_at_time(&values, at(time), duration);
                    }
                    ParamCall::CancelScheduledValues { time } => {
                        param.cancel_scheduled_values(at(time));
                    }
                    ParamCall::CancelAndHoldAtTime { time } => {
                        param.cancel_and_hold_at_time(at(time));
                    }
                }
            }
            Op::Start { id, when, offset: from, duration } => {
                let when = at(when);
                match self.nodes.get_mut(&id) {
                    Some(Node::Oscillator(n)) => n.start_at(when),
                    Some(Node::ConstantSource(n)) => n.start_at(when),
                    Some(Node::BufferSource(n)) => match duration {
                        Some(duration) => {
                            n.start_at_with_offset_and_duration(when, from.unwrap_or(0.0), duration)
                        }
                        None => n.start_at_with_offset(when, from.unwrap_or(0.0)),
                    },
                    _ => return,
                }
                self.started.insert(id);
            }
            Op::Stop { id, when } => {
                if !self.started.contains(&id) {
                    return;
                }
                let when = at(when);
                match self.nodes.get_mut(&id) {
                    Some(Node::Oscillator(n)) => n.stop_at(when),
                    Some(Node::ConstantSource(n)) => n.stop_at(when),
                    Some(Node::BufferSource(n)) => n.stop_at(when),
                    _ => {}
                }
            }
        }
    }

    /// Drops this side's handle. `web-audio-api` keeps rendering the node until it has nothing
    /// left to play, then frees it.
    fn forget(&mut self, id: u32) {
        if id == DESTINATION {
            return;
        }
        self.nodes.remove(&id);
        self.started.remove(&id);
        self.edges.retain(|e| e.from != id && e.to != id);
    }

    /// A source finished: nothing can restart it, so it goes.
    fn ended(&mut self, id: u32) {
        if self.nodes.get(&id).is_some_and(Node::is_source) {
            self.forget(id);
        }
    }

    /// Silences and forgets everything (the page reloaded: its nodes are gone on that side).
    fn clear(&mut self) {
        for (id, node) in self.nodes.iter_mut() {
            if *id == DESTINATION {
                continue;
            }
            let _ = catch_unwind(AssertUnwindSafe(|| {
                if self.started.contains(id) {
                    match node {
                        Node::Oscillator(n) => n.stop(),
                        Node::ConstantSource(n) => n.stop(),
                        Node::BufferSource(n) => n.stop(),
                        _ => {}
                    }
                }
                node.audio().disconnect();
            }));
        }
        self.nodes.retain(|id, _| *id == DESTINATION);
        self.edges.clear();
        self.started.clear();
    }

    /// An analyser's current data: `floatTime`, `byteTime`, `floatFrequency` or `byteFrequency`.
    fn analyser(&mut self, id: u32, kind: &str) -> Vec<u8> {
        let Some(Node::Analyser(n)) = self.nodes.get_mut(&id) else { return Vec::new() };
        match kind {
            "byteTime" => {
                let mut data = vec![0u8; n.fft_size()];
                n.get_byte_time_domain_data(&mut data);
                data
            }
            "byteFrequency" => {
                let mut data = vec![0u8; n.frequency_bin_count()];
                n.get_byte_frequency_data(&mut data);
                data
            }
            "floatFrequency" => {
                let mut data = vec![0f32; n.frequency_bin_count()];
                n.get_float_frequency_data(&mut data);
                f32_bytes(&[data.as_slice()])
            }
            _ => {
                let mut data = vec![0f32; n.fft_size()];
                n.get_float_time_domain_data(&mut data);
                f32_bytes(&[data.as_slice()])
            }
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Binary data (decoded audio and buffers written in JavaScript travel as raw bytes, not JSON)

/// Channels one after another, as little-endian f32s.
fn f32_bytes(channels: &[&[f32]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(channels.iter().map(|c| c.len() * 4).sum());
    for channel in channels {
        for sample in channel.iter() {
            out.extend_from_slice(&sample.to_le_bytes());
        }
    }
    out
}

/// The other way: `channels` runs of `length` samples.
fn planar_from_bytes(bytes: &[u8], channels: usize, length: usize) -> Result<Vec<Vec<f32>>, String> {
    if channels == 0 || bytes.len() != channels * length * 4 {
        return Err(format!("expected {channels} × {length} samples, got {} bytes", bytes.len()));
    }
    Ok(bytes
        .chunks_exact(length * 4)
        .map(|run| run.as_chunks::<4>().0.iter().map(|b| f32::from_le_bytes(*b)).collect())
        .collect())
}

/// A decoded buffer for JavaScript: a 16-byte header (channels, length, sample rate, 0), then
/// the channels. The header keeps the samples 4-byte aligned for a `Float32Array` view.
fn encode_buffer(buffer: &AudioBuffer) -> Vec<u8> {
    let channels: Vec<&[f32]> =
        (0..buffer.number_of_channels()).map(|c| buffer.get_channel_data(c)).collect();
    let mut out = Vec::with_capacity(16);
    out.extend_from_slice(&(buffer.number_of_channels() as u32).to_le_bytes());
    out.extend_from_slice(&(buffer.length() as u32).to_le_bytes());
    out.extend_from_slice(&buffer.sample_rate().to_le_bytes());
    out.extend_from_slice(&0u32.to_le_bytes());
    out.extend(f32_bytes(&channels));
    out
}

/// Decodes a file's audio at the app's sample rate. An offline context does the work, so loading
/// a file (the Slow Downer's waveform) doesn't open the output.
fn decode(bytes: Vec<u8>, sample_rate: f32) -> Result<AudioBuffer, String> {
    catch_unwind(move || {
        let ctx = OfflineAudioContext::new(1, 1, sample_rate);
        ctx.decode_audio_data_sync(Cursor::new(bytes)).map_err(|e| e.to_string())
    })
    .map_err(|_| "The decoder crashed on this file.".to_string())?
}

// ---------------------------------------------------------------------------------------------
// The clock tap: when each render callback ran

/// Quanta less than this apart belong to one callback (a callback asking for 256 frames renders
/// two 128-frame quanta back to back, microseconds apart; callbacks are 1.3 ms or more apart).
const CALLBACK_GAP_NANOS: u64 = 500_000;
/// A tap reading older than this means the output isn't running.
const TAP_FRESH_NANOS: u64 = 200_000_000;

/// Lock-free numbers the audio thread writes and anything reads: the context time at the start
/// of the latest render callback and when that callback ran (`audio::now_nanos()`), plus the
/// offset and output delay to go with them. That's what turns a time on JavaScript's clock into
/// the moment it's heard (the Recorder starts a take on the input sample where the first beat
/// after the count-in was heard), and what keeps the clock JavaScript sees smooth.
struct Tap {
    time_bits: AtomicU64,
    nanos: AtomicU64,
    last_quantum_nanos: AtomicU64,
    offset_bits: AtomicU64,
    latency_nanos: AtomicU64,
}

static TAP: Tap = Tap {
    time_bits: AtomicU64::new(0),
    nanos: AtomicU64::new(0),
    last_quantum_nanos: AtomicU64::new(0),
    offset_bits: AtomicU64::new(0),
    latency_nanos: AtomicU64::new(0),
};

/// A silent node in the live graph whose only job is to note when each render callback ran (its
/// first quantum). `web-audio-api` doesn't expose the callback's timing any other way.
struct ClockTap;

impl AudioWorkletProcessor for ClockTap {
    type ProcessorOptions = ();

    fn constructor(_: ()) -> Self {
        ClockTap
    }

    fn process<'a, 'b>(
        &mut self,
        _inputs: &'b [&'a [&'a [f32]]],
        outputs: &'b mut [&'a mut [&'a mut [f32]]],
        _params: AudioParamValues<'b>,
        scope: &'b AudioWorkletGlobalScope,
    ) -> bool {
        let now = audio::now_nanos();
        let last = TAP.last_quantum_nanos.swap(now, Ordering::Relaxed);
        if now.saturating_sub(last) > CALLBACK_GAP_NANOS {
            TAP.time_bits.store(scope.current_time.to_bits(), Ordering::Release);
            TAP.nanos.store(now, Ordering::Release);
        }
        for channel in outputs.iter_mut().flat_map(|o| o.iter_mut()) {
            channel.fill(0.0);
        }
        true
    }
}

fn add_tap(ctx: &AudioContext) -> AudioWorkletNode {
    let options = AudioWorkletNodeOptions {
        number_of_inputs: 0,
        number_of_outputs: 1,
        output_channel_count: vec![1],
        ..AudioWorkletNodeOptions::default()
    };
    let tap = AudioWorkletNode::new::<ClockTap>(ctx, options);
    tap.connect(&ctx.destination());
    tap
}

/// The latest callback's reading as (seconds JavaScript sees, `now_nanos()`), if it's fresh.
fn tap_reading() -> Option<(f64, u64)> {
    loop {
        let nanos = TAP.nanos.load(Ordering::Acquire);
        let time = f64::from_bits(TAP.time_bits.load(Ordering::Acquire));
        if TAP.nanos.load(Ordering::Acquire) != nanos {
            continue; // a callback wrote in between
        }
        if nanos == 0 || audio::now_nanos().saturating_sub(nanos) > TAP_FRESH_NANOS {
            return None;
        }
        return Some((time + f64::from_bits(TAP.offset_bits.load(Ordering::Relaxed)), nanos));
    }
}

/// When a sound scheduled at `at` (JavaScript's clock) comes out of the output device, in
/// `audio::now_nanos()` terms. None while the output isn't running.
pub fn heard_nanos(at: f64) -> Option<u64> {
    let (time, nanos) = tap_reading()?;
    let heard = nanos as f64 + (at - time) * 1e9 + TAP.latency_nanos.load(Ordering::Relaxed) as f64;
    Some(heard.max(0.0) as u64)
}

/// The inverse of `heard_nanos`: the time (JavaScript's clock) of a sound that comes out of the
/// output device at `nanos`. None while the output isn't running.
pub fn time_heard_at(nanos: u64) -> Option<f64> {
    let (time, tap_nanos) = tap_reading()?;
    let latency = TAP.latency_nanos.load(Ordering::Relaxed) as f64;
    Some(time + (nanos as f64 - tap_nanos as f64 - latency) / 1e9)
}

// ---------------------------------------------------------------------------------------------
// The live context

#[derive(Clone, Default, PartialEq)]
struct OutputPrefs {
    device_id: String,
    buffer_frames: u32,
}

#[derive(Clone, Default)]
struct Opened {
    device_id: String,
    device_name: String,
    buffer_frames: u32,
}

#[derive(Default)]
struct Inner {
    graph: Option<Graph<AudioContext>>,
    prefs: OutputPrefs,
    opened: Opened,
    /// Where the next context's clock starts, so time never jumps back.
    offset: f64,
    /// Goes up every time a context opens. JavaScript replays its graph when it changes.
    generation: u32,
    lost: bool,
    last_tick: Option<(f64, Instant)>,
    /// The live graph's clock tap (kept here so it lives as long as the context).
    tap: Option<AudioWorkletNode>,
}

pub struct Bridge {
    inner: Mutex<Inner>,
    buffers: Mutex<HashMap<u32, AudioBuffer>>,
    ended_tx: mpsc::Sender<u32>,
    ended_rx: Mutex<mpsc::Receiver<u32>>,
    /// Fixed for the app's lifetime, like a browser's `AudioContext.sampleRate`; JavaScript is
    /// told at start-up (see `init_script`).
    sample_rate: f32,
}

/// What every graph call answers: the clock (to anchor JavaScript's copy of it) and which
/// context it went to.
#[derive(Serialize)]
pub struct Batch {
    time: f64,
    generation: u32,
    /// Whether an output is running (JavaScript's clock only moves while one is).
    open: bool,
}

/// Picks the buffer size for a latency hint: `web-audio-api` turns seconds into the next power
/// of two of frames.
fn buffer_frames(requested: u32) -> u32 {
    if requested == 0 {
        DEFAULT_BUFFER
    } else {
        requested.next_power_of_two()
    }
}

/// The output's own rate, so nothing gets resampled. Asked until two readings agree: once, at
/// start-up, cpal's PipeWire host reported 44.1 kHz for a sink running at 48 kHz (and 48 kHz on
/// every later look), which would have had PipeWire resampling everything.
fn startup_sample_rate() -> f32 {
    let forced = audio::forced_output();
    let mut readings = Vec::new();
    let mut last = None;
    for _ in 0..4 {
        let rate = audio::output_sample_rate(forced.as_deref());
        readings.push(rate);
        if rate.is_some() && rate == last {
            break;
        }
        last = rate;
    }
    let rate = last.unwrap_or(48_000.0);
    eprintln!("audio bridge: running at {rate} Hz (readings {readings:?})");
    rate
}

/// Closes a context without waiting forever: a context whose device vanished never answers.
fn close(ctx: AudioContext) {
    let (done_tx, done_rx) = mpsc::channel();
    thread::spawn(move || {
        ctx.close_sync();
        let _ = done_tx.send(());
    });
    if done_rx.recv_timeout(Duration::from_millis(500)).is_err() {
        eprintln!("audio bridge: the old output didn't close; left behind");
    }
}

impl Bridge {
    pub fn new() -> Self {
        let (ended_tx, ended_rx) = mpsc::channel();
        let sample_rate = startup_sample_rate();
        Self {
            inner: Mutex::default(),
            buffers: Mutex::default(),
            ended_tx,
            ended_rx: Mutex::new(ended_rx),
            sample_rate,
        }
    }

    /// Runs in the window before the page's own scripts: `AudioContext.sampleRate` has to be
    /// readable straight away (tools build reverb impulses at that rate as soon as they mount).
    pub fn init_script(&self) -> String {
        format!("window.__SONIROLL_AUDIO__ = {{ sampleRate: {} }};", self.sample_rate)
    }

    /// Opens the output if it isn't open (or reopens it after the device went away).
    fn open(&self, inner: &mut Inner) -> Result<(), String> {
        if inner.lost {
            inner.lost = false;
            Self::close(inner);
        }
        if inner.graph.is_some() {
            return Ok(());
        }
        let forced = audio::forced_output();
        let device_id = forced.clone().unwrap_or_else(|| inner.prefs.device_id.clone());
        let (sink_id, device_name) = audio::output_sink(&device_id, forced.is_some())?;
        let frames = buffer_frames(inner.prefs.buffer_frames);
        let options = AudioContextOptions {
            // Half a frame extra so the seconds → frames rounding can't land one short.
            latency_hint: AudioContextLatencyCategory::Custom(
                (frames as f64 + 0.5) / self.sample_rate as f64,
            ),
            sample_rate: Some(self.sample_rate),
            sink_id,
            ..AudioContextOptions::default()
        };
        let ctx = catch_unwind(|| AudioContext::try_new(options))
            .map_err(|_| "The audio output couldn't be opened.".to_string())?
            .map_err(|e| e.to_string())?;
        TAP.nanos.store(0, Ordering::Release);
        TAP.offset_bits.store(inner.offset.to_bits(), Ordering::Release);
        inner.tap = Some(add_tap(&ctx));
        inner.graph = Some(Graph::new(ctx, inner.offset, self.ended_tx.clone()));
        inner.generation += 1;
        inner.opened = Opened { device_id, device_name, buffer_frames: frames };
        inner.last_tick = None;
        Ok(())
    }

    fn close(inner: &mut Inner) {
        inner.tap = None;
        if let Some(graph) = inner.graph.take() {
            inner.offset = graph.now();
            close(graph.ctx);
        }
    }

    fn batch(inner: &Inner) -> Batch {
        let time = inner.graph.as_ref().map_or(inner.offset, Graph::now);
        Batch { time, generation: inner.generation, open: inner.graph.is_some() }
    }

    /// The clock for JavaScript, or nothing while no output is running. Also notices a stalled
    /// clock (the device went away).
    fn tick(&self) -> Option<ClockTick> {
        let mut inner = self.inner.lock().unwrap();
        let inner = &mut *inner;
        let graph = inner.graph.as_ref()?;
        if graph.ctx.state() != AudioContextState::Running || inner.lost {
            return None;
        }
        let now = graph.ctx.current_time();
        match inner.last_tick {
            Some((last, at)) if last == now => {
                if at.elapsed() > STALL {
                    eprintln!("audio bridge: the output stopped; it reopens with the next sound");
                    inner.lost = true;
                    return None;
                }
            }
            _ => inner.last_tick = Some((now, Instant::now())),
        }
        let latency = graph.ctx.base_latency() + graph.ctx.output_latency();
        TAP.latency_nanos.store((latency * 1e9) as u64, Ordering::Relaxed);
        // The context's own clock moves a callback at a time; the tap says when that callback ran.
        let time = match tap_reading() {
            Some((time, nanos)) => time + audio::now_nanos().saturating_sub(nanos) as f64 / 1e9,
            None => now + graph.offset,
        };
        Some(ClockTick { time, latency })
    }

    /// Sources that finished since the last call (each one forgotten here too).
    fn take_ended(&self) -> Vec<u32> {
        let ended: Vec<u32> = self.ended_rx.lock().unwrap().try_iter().collect();
        if !ended.is_empty() {
            if let Some(graph) = self.inner.lock().unwrap().graph.as_mut() {
                for id in &ended {
                    graph.ended(*id);
                }
            }
        }
        ended
    }
}

#[derive(Clone, Serialize)]
struct ClockTick {
    time: f64,
    latency: f64,
}

/// Reports the clock and finished sources to the window, ~50 times a second.
pub fn spawn_clock(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(20));
        let bridge = app.state::<Bridge>();
        if let Some(tick) = bridge.tick() {
            let _ = app.emit("audio-clock", tick);
        }
        let ended = bridge.take_ended();
        if !ended.is_empty() {
            let _ = app.emit("wa-ended", ended);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Commands

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request.headers().get(name).and_then(|v| v.to_str().ok()).ok_or_else(|| format!("missing {name} header"))
}

fn raw_body(request: &Request<'_>) -> Result<Vec<u8>, String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        InvokeBody::Json(_) => Err("expected raw bytes".into()),
    }
}

/// A new page: forget everything the last one left (a reload in the middle of a held tone
/// mustn't leave it sounding). The output and its clock carry on.
#[tauri::command]
pub fn wa_init(bridge: tauri::State<'_, Bridge>) -> Batch {
    let mut inner = bridge.inner.lock().unwrap();
    if let Some(graph) = inner.graph.as_mut() {
        graph.clear();
    }
    bridge.buffers.lock().unwrap().clear();
    let _ = bridge.ended_rx.lock().unwrap().try_iter().count();
    Bridge::batch(&inner)
}

/// One batch of graph calls (everything JavaScript did in one tick). Opens the output first.
#[tauri::command(async)]
pub fn wa_ops(bridge: tauri::State<'_, Bridge>, ops: Vec<Op>) -> Result<Batch, String> {
    let mut inner = bridge.inner.lock().unwrap();
    bridge.open(&mut inner)?;
    let mut buffers = bridge.buffers.lock().unwrap();
    let graph = inner.graph.as_mut().expect("opened above");
    for op in ops {
        match op {
            Op::FreeBuffer { id } => {
                buffers.remove(&id);
            }
            Op::Suspend => graph.ctx.suspend_sync(),
            Op::Resume => graph.ctx.resume_sync(),
            op => graph.apply(op, &buffers),
        }
    }
    drop(buffers);
    Ok(Bridge::batch(&inner))
}

/// A buffer written in JavaScript (`createBuffer` + `getChannelData`): raw f32 channels, with
/// `x-buffer: id,channels,length,sampleRate`.
#[tauri::command(async)]
pub fn wa_buffer(bridge: tauri::State<'_, Bridge>, request: Request<'_>) -> Result<(), String> {
    let spec: Vec<f64> = header(&request, "x-buffer")?.split(',').filter_map(|v| v.parse().ok()).collect();
    let [id, channels, length, sample_rate] = spec[..] else { return Err("bad x-buffer header".into()) };
    let data = planar_from_bytes(&raw_body(&request)?, channels as usize, length as usize)?;
    let buffer = catch_unwind(|| AudioBuffer::from(data, sample_rate as f32))
        .map_err(|_| "invalid buffer".to_string())?;
    bridge.buffers.lock().unwrap().insert(id as u32, buffer);
    Ok(())
}

/// `decodeAudioData`: the file's bytes in, the decoded channels out (JavaScript keeps a copy for
/// `getChannelData`; this side keeps one to play). `x-id` names the buffer.
#[tauri::command]
pub async fn wa_decode(bridge: tauri::State<'_, Bridge>, request: Request<'_>) -> Result<Response, String> {
    let id: u32 = header(&request, "x-id")?.parse().map_err(|_| "bad x-id header")?;
    let bytes = raw_body(&request)?;
    let sample_rate = bridge.sample_rate;
    let buffer = tauri::async_runtime::spawn_blocking(move || decode(bytes, sample_rate))
        .await
        .map_err(|e| e.to_string())??;
    let encoded = encode_buffer(&buffer);
    bridge.buffers.lock().unwrap().insert(id, buffer);
    Ok(Response::new(encoded))
}

#[tauri::command(async)]
pub fn wa_analyser(bridge: tauri::State<'_, Bridge>, id: u32, kind: String) -> Response {
    let mut inner = bridge.inner.lock().unwrap();
    Response::new(inner.graph.as_mut().map(|g| g.analyser(id, &kind)).unwrap_or_default())
}

/// Picks the output device and buffer size (0 = the default), reopening the output if it's
/// running; JavaScript then replays its graph into the new one.
#[tauri::command(async)]
pub fn audio_set_output(
    bridge: tauri::State<'_, Bridge>,
    device_id: String,
    buffer_frames: u32,
) -> Result<Batch, String> {
    let mut inner = bridge.inner.lock().unwrap();
    let prefs = OutputPrefs { device_id, buffer_frames };
    if inner.prefs != prefs {
        inner.prefs = prefs;
        if inner.graph.is_some() {
            Bridge::close(&mut inner);
            bridge.open(&mut inner)?;
        }
    }
    Ok(Bridge::batch(&inner))
}

#[derive(Serialize)]
pub struct Status {
    running: bool,
    host: String,
    device_id: String,
    device_name: String,
    sample_rate: u32,
    requested_buffer: u32,
    buffer_frames: u32,
    buffer_ms: f64,
    output_latency_ms: f64,
    /// Nodes and buffers this side holds (for spotting leaks).
    nodes: usize,
    buffers: usize,
}

#[tauri::command]
pub fn audio_status(bridge: tauri::State<'_, Bridge>) -> Status {
    let inner = bridge.inner.lock().unwrap();
    let running =
        inner.graph.as_ref().is_some_and(|g| g.ctx.state() == AudioContextState::Running) && !inner.lost;
    let latency = inner.graph.as_ref().map_or(0.0, |g| g.ctx.output_latency());
    let frames = if running { inner.opened.buffer_frames } else { 0 };
    Status {
        running,
        host: audio::host_name(),
        device_id: if running { inner.opened.device_id.clone() } else { inner.prefs.device_id.clone() },
        device_name: inner.opened.device_name.clone(),
        sample_rate: bridge.sample_rate as u32,
        requested_buffer: inner.prefs.buffer_frames,
        buffer_frames: frames,
        buffer_ms: frames as f64 * 1000.0 / bridge.sample_rate as f64,
        output_latency_ms: latency * 1000.0,
        nodes: inner.graph.as_ref().map_or(0, |g| g.nodes.len()),
        buffers: bridge.buffers.lock().unwrap().len(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SR: f32 = 48_000.0;

    fn graph(seconds: f32, offset: f64) -> (Graph<OfflineAudioContext>, mpsc::Receiver<u32>) {
        let (tx, rx) = mpsc::channel();
        let ctx = OfflineAudioContext::new(1, (seconds * SR) as usize, SR);
        (Graph::new(ctx, offset, tx), rx)
    }

    /// Ops written the way JavaScript sends them.
    fn run(graph: &mut Graph<OfflineAudioContext>, buffers: &HashMap<u32, AudioBuffer>, json: &str) {
        let ops: Vec<Op> = serde_json::from_str(json).unwrap();
        for op in ops {
            graph.apply(op, buffers);
        }
    }

    fn render(graph: &mut Graph<OfflineAudioContext>) -> Vec<f32> {
        graph.ctx.start_rendering_sync().get_channel_data(0).to_vec()
    }

    /// The website's `scheduleClick`, as ops.
    fn click(id: u32, at: f64) -> String {
        let (osc, gain) = (id, id + 1);
        format!(
            r#"{{"op":"create","id":{osc},"kind":"oscillator"}},{{"op":"create","id":{gain},"kind":"gain"}},
            {{"op":"connect","from":{osc},"to":{gain}}},{{"op":"connect","from":{gain},"to":0}},
            {{"op":"set","id":{osc},"key":"type","value":"sine"}},
            {{"op":"param","id":{osc},"name":"frequency","call":{{"fn":"value","value":1000}}}},
            {{"op":"param","id":{gain},"name":"gain","call":{{"fn":"setValueAtTime","value":0.9,"time":{at}}}}},
            {{"op":"param","id":{gain},"name":"gain","call":{{"fn":"exponentialRampToValueAtTime","value":0.0001,"time":{end}}}}},
            {{"op":"start","id":{osc},"when":{at}}},{{"op":"stop","id":{osc},"when":{end}}}"#,
            end = at + 0.06
        )
    }

    fn first_sound(out: &[f32]) -> usize {
        out.iter().position(|s| s.abs() > 1e-6).unwrap()
    }

    #[test]
    fn a_click_lands_on_its_exact_sample() {
        let (mut g, _) = graph(1.0, 0.0);
        run(&mut g, &HashMap::new(), &format!("[{}]", click(1, 0.5)));
        let out = render(&mut g);
        // A sine starts at phase 0, so the first non-zero sample is the one right after.
        assert_eq!(first_sound(&out), 24_001);
        assert!(out[24_000 + 2_881..].iter().all(|s| *s == 0.0));
    }

    #[test]
    fn clicks_stay_exactly_a_beat_apart() {
        // 100 BPM: 28,800 samples between clicks at 48 kHz, like the end-to-end recording test.
        let (mut g, _) = graph(2.0, 0.0);
        let clicks: Vec<String> = (0..3).map(|i| click(1 + i * 2, 0.1 + i as f64 * 0.6)).collect();
        run(&mut g, &HashMap::new(), &format!("[{}]", clicks.join(",")));
        let out = render(&mut g);
        // (Sub-sample starts leave a ~1e-11 sample just before some clicks: count from 1e-6.)
        let loud = |s: &f32| s.abs() > 1e-6;
        let onsets: Vec<usize> =
            (50..out.len()).filter(|&i| loud(&out[i]) && !out[i - 50..i].iter().any(loud)).collect();
        assert_eq!(onsets, vec![4_801, 4_801 + 28_800, 4_801 + 57_600]);
    }

    #[test]
    fn times_include_the_offset_after_a_reopen() {
        // The context restarted from 0 while JavaScript's clock was at 10 s.
        let (mut g, _) = graph(1.0, 10.0);
        run(&mut g, &HashMap::new(), &format!("[{}]", click(1, 10.25)));
        assert_eq!(first_sound(&render(&mut g)), 12_001);
    }

    #[test]
    fn connecting_twice_doesnt_double_the_sound() {
        let level = |json: &str| {
            let (mut g, _) = graph(0.1, 0.0);
            run(&mut g, &HashMap::new(), json);
            render(&mut g).iter().fold(0.0f32, |a, s| a.max(s.abs()))
        };
        let once = r#"[{"op":"create","id":1,"kind":"constantSource"},{"op":"connect","from":1,"to":0},
            {"op":"param","id":1,"name":"offset","call":{"fn":"value","value":0.25}},{"op":"start","id":1,"when":0}]"#;
        let twice = once.replace(r#"{"op":"start""#, r#"{"op":"connect","from":1,"to":0},{"op":"start""#);
        assert!((level(once) - 0.25).abs() < 1e-6);
        assert!((level(&twice) - 0.25).abs() < 1e-6);
    }

    #[test]
    fn disconnect_and_free_silence_a_node() {
        let (mut g, _) = graph(0.1, 0.0);
        run(
            &mut g,
            &HashMap::new(),
            r#"[{"op":"create","id":1,"kind":"constantSource"},{"op":"create","id":2,"kind":"gain"},
            {"op":"connect","from":1,"to":2},{"op":"connect","from":2,"to":0},{"op":"start","id":1,"when":0},
            {"op":"disconnect","from":2},{"op":"free","id":2}]"#,
        );
        assert!(g.edges.iter().all(|e| e.from != 2 && e.to != 2));
        assert!(render(&mut g).iter().all(|s| *s == 0.0));
    }

    #[test]
    fn disconnecting_a_node_leaves_its_params_alone() {
        let (mut g, _) = graph(0.1, 0.0);
        run(
            &mut g,
            &HashMap::new(),
            r#"[{"op":"create","id":1,"kind":"constantSource"},{"op":"create","id":2,"kind":"gain"},
            {"op":"connect","from":1,"to":2},{"op":"connect","from":1,"to":2,"param":"gain"},
            {"op":"disconnect","from":1,"to":2}]"#,
        );
        let left: Vec<&Edge> = g.edges.iter().collect();
        assert_eq!(left, vec![&Edge { from: 1, output: 0, to: 2, input: Input::Param("gain".into()) }]);
        run(&mut g, &HashMap::new(), r#"[{"op":"disconnect","from":1}]"#);
        assert!(g.edges.is_empty());
    }

    #[test]
    fn a_sample_plays_from_an_uploaded_buffer_at_its_playback_rate() {
        // A 100-sample ramp, sent the way JavaScript uploads a buffer, played at double speed.
        let ramp: Vec<f32> = (0..100).map(|i| (i + 1) as f32 / 100.0).collect();
        let data = planar_from_bytes(&f32_bytes(&[ramp.as_slice()]), 1, 100).unwrap();
        let buffers = HashMap::from([(9, AudioBuffer::from(data, SR))]);
        let (mut g, ended) = graph(0.1, 0.0);
        run(
            &mut g,
            &buffers,
            r#"[{"op":"create","id":1,"kind":"bufferSource"},{"op":"buffer","id":1,"buffer":9},
            {"op":"param","id":1,"name":"playbackRate","call":{"fn":"value","value":2}},
            {"op":"connect","from":1,"to":0},{"op":"start","id":1,"when":0}]"#,
        );
        let out = render(&mut g);
        assert!((out[0] - 0.01).abs() < 1e-6 && (out[10] - 0.21).abs() < 1e-3, "{:?}", &out[..12]);
        assert!(out[52..].iter().all(|s| *s == 0.0));
        // The ended event comes back for JavaScript's `onended`.
        assert_eq!(ended.recv_timeout(Duration::from_secs(2)).ok(), Some(1));
        g.ended(1);
        assert!(!g.nodes.contains_key(&1));
    }

    #[test]
    fn a_gain_with_one_channel_sums_a_stereo_sample_to_the_middle() {
        // What `playSampledNote` does with the stereo piano recordings.
        let buffers = HashMap::from([(9, AudioBuffer::from(vec![vec![0.5; 64], vec![0.1; 64]], SR))]);
        let (tx, _rx) = mpsc::channel();
        let mut g = Graph::new(OfflineAudioContext::new(2, 64, SR), 0.0, tx);
        run(
            &mut g,
            &buffers,
            r#"[{"op":"create","id":1,"kind":"bufferSource"},{"op":"buffer","id":1,"buffer":9},
            {"op":"create","id":2,"kind":"gain"},
            {"op":"channels","id":2,"count":1,"mode":"explicit","interpretation":"speakers"},
            {"op":"connect","from":1,"to":2},{"op":"connect","from":2,"to":0},{"op":"start","id":1,"when":0}]"#,
        );
        let out = g.ctx.start_rendering_sync();
        assert!((out.get_channel_data(0)[10] - 0.3).abs() < 1e-6);
        assert!((out.get_channel_data(1)[10] - 0.3).abs() < 1e-6);
    }

    #[test]
    fn refused_ops_are_skipped_not_fatal() {
        let (mut g, _) = graph(0.1, 0.0);
        // An exponential ramp to 0 is a RangeError in the spec; web-audio-api panics on it.
        run(
            &mut g,
            &HashMap::new(),
            r#"[{"op":"create","id":1,"kind":"gain"},
            {"op":"param","id":1,"name":"gain","call":{"fn":"exponentialRampToValueAtTime","value":0,"time":1}},
            {"op":"stop","id":7,"when":0},{"op":"connect","from":1,"to":99}]"#,
        );
        assert!(g.nodes.contains_key(&1));
    }

    #[test]
    fn decoded_buffers_travel_with_a_header() {
        let buffer = AudioBuffer::from(vec![vec![0.25, -0.5], vec![1.0, 0.0]], 44_100.0);
        let bytes = encode_buffer(&buffer);
        assert_eq!(bytes.len(), 16 + 4 * 4);
        assert_eq!(u32::from_le_bytes(bytes[0..4].try_into().unwrap()), 2);
        assert_eq!(u32::from_le_bytes(bytes[4..8].try_into().unwrap()), 2);
        assert_eq!(f32::from_le_bytes(bytes[8..12].try_into().unwrap()), 44_100.0);
        let channels = planar_from_bytes(&bytes[16..], 2, 2).unwrap();
        assert_eq!(channels, vec![vec![0.25, -0.5], vec![1.0, 0.0]]);
        assert!(planar_from_bytes(&bytes[16..], 3, 2).is_err());
    }

    #[test]
    fn decodes_a_wav_file() {
        // A 4-sample mono 16-bit WAV at 48 kHz.
        let samples: [i16; 4] = [0, 16_384, -16_384, 32_767];
        let mut wav = Vec::new();
        wav.extend_from_slice(b"RIFF");
        wav.extend_from_slice(&(36u32 + 8).to_le_bytes());
        wav.extend_from_slice(b"WAVEfmt ");
        wav.extend_from_slice(&16u32.to_le_bytes());
        wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
        wav.extend_from_slice(&1u16.to_le_bytes()); // mono
        wav.extend_from_slice(&48_000u32.to_le_bytes());
        wav.extend_from_slice(&96_000u32.to_le_bytes());
        wav.extend_from_slice(&2u16.to_le_bytes());
        wav.extend_from_slice(&16u16.to_le_bytes());
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&8u32.to_le_bytes());
        for s in samples {
            wav.extend_from_slice(&s.to_le_bytes());
        }
        let buffer = decode(wav, SR).unwrap();
        assert_eq!(buffer.length(), 4);
        assert!((buffer.get_channel_data(0)[1] - 0.5).abs() < 1e-3);
        assert!(decode(b"not audio".to_vec(), SR).is_err());
    }

    #[test]
    fn buffer_sizes_round_up_to_a_power_of_two() {
        assert_eq!(buffer_frames(0), 256);
        assert_eq!(buffer_frames(128), 128);
        assert_eq!(buffer_frames(300), 512);
    }
}
