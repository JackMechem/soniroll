//! The native audio engine. One output stream (clicks and reference tones, mixed in the audio
//! callback at exact sample positions) and one optional input stream (the tuner's microphone).
//!
//! The web app's scheduling logic still runs in JavaScript: it decides *when* each click
//! happens, in engine seconds, and sends a batch ahead of time (`audio_schedule`). This side only
//! has to place each click on the right sample, which is what makes the timing exact. The engine
//! clock (seconds of audio rendered) is reported back about 50 times a second so JavaScript can
//! read it like Web Audio's `currentTime`.

use std::f32::consts::TAU;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, Device, FromSample, OutputCallbackInfo, SampleFormat, SizedSample, StreamConfig};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------------------------
// Shared state

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Wave {
    Sine,
    Square,
    Sawtooth,
    Triangle,
}

#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Click {
    /// Engine seconds.
    at: f64,
    wave: Wave,
    freq: f32,
    gain: f32,
    /// Seconds.
    length: f32,
}

enum Cmd {
    Click(Click),
    ToneStart { id: u32, freq: f32, wave: Wave, volume: f32, duration: Option<f32> },
    ToneStop { id: u32 },
}

/// Lock-free numbers the audio callback writes and everything else reads.
struct Meters {
    /// Engine seconds at the start of the last callback (f64 bits).
    now_bits: AtomicU64,
    /// When that callback ran, in nanoseconds since `epoch()`.
    callback_nanos: AtomicU64,
    /// Frames per callback, as last seen.
    buffer_frames: AtomicU32,
    /// Time from the callback to the sound reaching the device, in microseconds.
    latency_micros: AtomicU32,
    running: AtomicBool,
    /// The output device went away (unplugged); reopen on the next sound.
    lost: AtomicBool,
}

static METERS: Meters = Meters {
    now_bits: AtomicU64::new(0),
    callback_nanos: AtomicU64::new(0),
    buffer_frames: AtomicU32::new(0),
    latency_micros: AtomicU32::new(0),
    running: AtomicBool::new(false),
    lost: AtomicBool::new(false),
};

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

/// The engine clock right now: the last callback's time plus how long ago it ran.
fn engine_now() -> f64 {
    let base = f64::from_bits(METERS.now_bits.load(Ordering::Acquire));
    if !METERS.running.load(Ordering::Acquire) {
        return base;
    }
    let at = METERS.callback_nanos.load(Ordering::Acquire);
    let since = epoch().elapsed().as_nanos() as u64;
    base + since.saturating_sub(at) as f64 / 1e9
}

struct Output {
    commands: rtrb::Producer<Cmd>,
    stop: mpsc::Sender<()>,
    device_name: String,
    device_id: String,
    sample_rate: u32,
    requested_buffer: u32,
}

#[derive(Default)]
pub struct AudioState {
    output: Mutex<Option<Output>>,
    /// Which output device and buffer size to use the next time the stream opens.
    prefs: Mutex<OutputPrefs>,
    input_stop: Mutex<Option<Arc<AtomicBool>>>,
    ended: Mutex<Option<rtrb::Consumer<u32>>>,
}

#[derive(Clone, Default)]
struct OutputPrefs {
    device_id: String,
    buffer_frames: u32,
}

// ---------------------------------------------------------------------------------------------
// Devices

fn host() -> cpal::Host {
    #[cfg(all(target_os = "linux", feature = "pipewire"))]
    {
        if let Ok(host) = cpal::host_from_id(cpal::HostId::PipeWire) {
            return host;
        }
    }
    cpal::default_host()
}

#[derive(Serialize)]
pub struct DeviceInfo {
    id: String,
    label: String,
}

#[derive(Serialize)]
pub struct Devices {
    host: String,
    inputs: Vec<DeviceInfo>,
    outputs: Vec<DeviceInfo>,
}

fn describe(device: &Device) -> Option<DeviceInfo> {
    let id = device.id().ok()?.to_string();
    let label = device.description().map(|d| d.name().to_string()).unwrap_or_else(|_| id.clone());
    Some(DeviceInfo { id, label })
}

fn find_device(id: &str, input: bool) -> Option<Device> {
    let host = host();
    if !id.is_empty() {
        if let Ok(parsed) = id.parse() {
            if let Some(device) = host.device_by_id(&parsed) {
                return Some(device);
            }
        }
    }
    if input {
        host.default_input_device()
    } else {
        host.default_output_device()
    }
}

/// Real devices only: "System default" is offered separately, and PipeWire also lists its
/// default aliases, other apps' streams ("unknown") and every output's monitor as an input.
fn listed(device: &Device, input: bool, pipewire: bool) -> Option<DeviceInfo> {
    let info = describe(device)?;
    if info.id.ends_with("_default") || info.label == "unknown" {
        return None;
    }
    if input && pipewire && device.supports_output() {
        return None;
    }
    Some(info)
}

#[tauri::command]
pub fn audio_devices() -> Devices {
    let host = host();
    let pipewire = host.id().name().contains("PipeWire");
    let inputs = host.input_devices().map(|d| d.filter_map(|d| listed(&d, true, pipewire)).collect());
    let outputs = host.output_devices().map(|d| d.filter_map(|d| listed(&d, false, pipewire)).collect());
    Devices {
        host: host.id().name().to_string(),
        inputs: inputs.unwrap_or_default(),
        outputs: outputs.unwrap_or_default(),
    }
}

// ---------------------------------------------------------------------------------------------
// Voices (all of this runs on the audio thread: no allocation, no locks)

const MAX_VOICES: usize = 64;
const SILENT: f32 = 0.0001;
const TONE_ATTACK: f32 = 0.03;
const TONE_RELEASE: f32 = 0.12;

#[derive(Clone, Copy)]
enum Stage {
    /// Waiting for its start frame.
    Pending,
    /// Ramping by `mult` per frame until `stage_end`.
    Ramp,
    /// Holding its level until stopped (a sustained tone).
    Hold,
}

#[derive(Clone, Copy)]
struct Voice {
    tone_id: Option<u32>,
    wave: Wave,
    phase: f32,
    step: f32,
    amp: f32,
    mult: f32,
    start: u64,
    stage: Stage,
    stage_end: u64,
    /// What happens when the current ramp ends: hold, decay to silence by `decay_end`, or stop.
    after: After,
    decay_end: u64,
    /// The frame the voice stops sounding (0 = not set yet).
    end: u64,
}

#[derive(Clone, Copy, PartialEq)]
enum After {
    Hold,
    Decay,
    Stop,
}

/// Web Audio's exponential ramp, as a per-frame multiplier.
fn ramp_mult(from: f32, to: f32, frames: u64) -> f32 {
    if frames == 0 {
        return 1.0;
    }
    (to.max(SILENT) / from.max(SILENT)).powf(1.0 / frames as f32)
}

/// PolyBLEP: rounds off the jumps in square and saw waves so high clicks don't alias.
fn poly_blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let t = t / dt;
        t + t - t * t - 1.0
    } else if t > 1.0 - dt {
        let t = (t - 1.0) / dt;
        t * t + t + t + 1.0
    } else {
        0.0
    }
}

impl Voice {
    fn sample(&mut self) -> f32 {
        let t = self.phase;
        let dt = self.step;
        let value = match self.wave {
            Wave::Sine => (t * TAU).sin(),
            Wave::Triangle => 1.0 - 4.0 * (t - 0.5).abs(),
            Wave::Sawtooth => (2.0 * t - 1.0) - poly_blep(t, dt),
            Wave::Square => {
                let naive = if t < 0.5 { 1.0 } else { -1.0 };
                naive + poly_blep(t, dt) - poly_blep((t + 0.5) % 1.0, dt)
            }
        };
        self.phase += dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        value
    }
}

struct Mixer {
    voices: [Option<Voice>; MAX_VOICES],
    sample_rate: f32,
    frame: u64,
    start_secs: f64,
    ended: rtrb::Producer<u32>,
}

impl Mixer {
    fn add(&mut self, voice: Voice) {
        if let Some(slot) = self.voices.iter_mut().find(|v| v.is_none()) {
            *slot = Some(voice);
        }
    }

    fn secs_to_frame(&self, secs: f64) -> u64 {
        let offset = (secs - self.start_secs) * self.sample_rate as f64;
        if offset <= self.frame as f64 {
            self.frame
        } else {
            offset.round() as u64
        }
    }

    fn handle(&mut self, cmd: Cmd) {
        let sr = self.sample_rate;
        match cmd {
            Cmd::Click(c) => {
                let start = self.secs_to_frame(c.at);
                let len = ((c.length * sr) as u64).max(1);
                let gain = c.gain.max(SILENT);
                self.add(Voice {
                    tone_id: None,
                    wave: c.wave,
                    phase: 0.0,
                    step: c.freq / sr,
                    amp: gain,
                    mult: ramp_mult(gain, SILENT, len),
                    start,
                    stage: Stage::Pending,
                    stage_end: start + len,
                    after: After::Stop,
                    decay_end: 0,
                    end: start + len,
                });
            }
            Cmd::ToneStart { id, freq, wave, volume, duration } => {
                let start = self.frame;
                let attack = (TONE_ATTACK * sr) as u64;
                let (after, decay_end) = match duration {
                    Some(d) => (After::Decay, start + (d * sr) as u64),
                    None => (After::Hold, 0),
                };
                self.add(Voice {
                    tone_id: Some(id),
                    wave,
                    phase: 0.0,
                    step: freq / sr,
                    amp: SILENT,
                    mult: ramp_mult(SILENT, volume, attack),
                    start,
                    stage: Stage::Pending,
                    stage_end: start + attack,
                    after,
                    decay_end,
                    end: if after == After::Decay { decay_end + (0.02 * sr) as u64 } else { 0 },
                });
            }
            Cmd::ToneStop { id } => {
                let release = (TONE_RELEASE * sr) as u64;
                let frame = self.frame;
                for voice in self.voices.iter_mut().flatten() {
                    if voice.tone_id == Some(id) {
                        voice.stage = Stage::Ramp;
                        voice.mult = ramp_mult(voice.amp, SILENT, release);
                        voice.stage_end = frame + release;
                        voice.after = After::Stop;
                        voice.end = frame + release + (0.02 * sr) as u64;
                    }
                }
            }
        }
    }

    fn next(&mut self) -> f32 {
        let frame = self.frame;
        let mut mix = 0.0;
        for slot in self.voices.iter_mut() {
            let Some(voice) = slot else { continue };
            if voice.end != 0 && frame >= voice.end {
                if let Some(id) = voice.tone_id {
                    let _ = self.ended.push(id);
                }
                *slot = None;
                continue;
            }
            match voice.stage {
                Stage::Pending => {
                    if frame < voice.start {
                        continue;
                    }
                    voice.stage = Stage::Ramp;
                }
                Stage::Ramp if frame >= voice.stage_end => match voice.after {
                    After::Hold => {
                        voice.stage = Stage::Hold;
                    }
                    After::Decay => {
                        voice.mult = ramp_mult(voice.amp, SILENT, voice.decay_end.saturating_sub(frame));
                        voice.stage_end = voice.decay_end;
                        voice.after = After::Stop;
                    }
                    After::Stop => {
                        voice.amp = 0.0;
                        voice.mult = 1.0;
                    }
                },
                _ => {}
            }
            mix += voice.sample() * voice.amp;
            if matches!(voice.stage, Stage::Ramp) {
                voice.amp *= voice.mult;
            }
        }
        self.frame += 1;
        mix
    }
}

// ---------------------------------------------------------------------------------------------
// Output stream

fn open_output(state: &AudioState) -> Result<(), String> {
    let mut output = state.output.lock().unwrap();
    if METERS.lost.swap(false, Ordering::AcqRel) {
        if let Some(old) = output.take() {
            let _ = old.stop.send(());
        }
    }
    if output.is_some() {
        return Ok(());
    }
    let prefs = state.prefs.lock().unwrap().clone();
    let device = find_device(&prefs.device_id, false).ok_or("No audio output found.")?;
    let supported = device.default_output_config().map_err(|e| e.to_string())?;
    let mut config: StreamConfig = supported.config();
    if prefs.buffer_frames > 0 {
        if let cpal::SupportedBufferSize::Range { min, max } = supported.buffer_size() {
            config.buffer_size = BufferSize::Fixed(prefs.buffer_frames.clamp(*min, *max));
        }
    }

    let (commands, consumer) = rtrb::RingBuffer::<Cmd>::new(1024);
    let (ended_tx, ended_rx) = rtrb::RingBuffer::<u32>::new(256);
    *state.ended.lock().unwrap() = Some(ended_rx);
    let (stop, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let start_secs = engine_now();
    let format = supported.sample_format();
    let info = describe(&device);

    // cpal streams aren't `Send` on every platform, so each one lives on its own thread.
    thread::spawn(move || {
        let mixer = Mixer {
            voices: [None; MAX_VOICES],
            sample_rate: config.sample_rate as f32,
            frame: 0,
            start_secs,
            ended: ended_tx,
        };
        let stream = match format {
            SampleFormat::F32 => build_output::<f32>(&device, config, mixer, consumer),
            SampleFormat::I16 => build_output::<i16>(&device, config, mixer, consumer),
            SampleFormat::I32 => build_output::<i32>(&device, config, mixer, consumer),
            SampleFormat::U16 => build_output::<u16>(&device, config, mixer, consumer),
            SampleFormat::F64 => build_output::<f64>(&device, config, mixer, consumer),
            other => Err(format!("Unsupported sample format {other}")),
        };
        let stream = match stream.and_then(|s| s.play().map(|_| s).map_err(|e| e.to_string())) {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ready_tx.send(Err(error));
                return;
            }
        };
        let _ = ready_tx.send(Ok(()));
        let _ = stop_rx.recv();
        METERS.running.store(false, Ordering::Release);
        drop(stream);
    });

    ready_rx.recv().map_err(|e| e.to_string())??;
    let info = info.unwrap_or(DeviceInfo { id: String::new(), label: "Default".into() });
    *output = Some(Output {
        commands,
        stop,
        device_name: info.label,
        device_id: info.id,
        sample_rate: config.sample_rate,
        requested_buffer: prefs.buffer_frames,
    });
    Ok(())
}

fn build_output<T>(
    device: &Device,
    config: StreamConfig,
    mut mixer: Mixer,
    mut commands: rtrb::Consumer<Cmd>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample + FromSample<f32>,
{
    let channels = config.channels as usize;
    let sample_rate = config.sample_rate as f64;
    device
        .build_output_stream(
            config,
            move |data: &mut [T], info: &OutputCallbackInfo| {
                let ts = info.timestamp();
                let latency = ts.playback.duration_since(ts.callback);
                METERS.latency_micros.store(latency.as_micros() as u32, Ordering::Relaxed);
                METERS.buffer_frames.store((data.len() / channels) as u32, Ordering::Relaxed);
                let now = mixer.start_secs + mixer.frame as f64 / sample_rate;
                METERS.now_bits.store(now.to_bits(), Ordering::Release);
                METERS.callback_nanos.store(epoch().elapsed().as_nanos() as u64, Ordering::Release);
                METERS.running.store(true, Ordering::Release);

                while let Ok(cmd) = commands.pop() {
                    mixer.handle(cmd);
                }
                for frame in data.chunks_mut(channels) {
                    let value = T::from_sample(mixer.next().clamp(-1.0, 1.0));
                    for sample in frame.iter_mut() {
                        *sample = value;
                    }
                }
            },
            |error| {
                eprintln!("audio output error: {error}");
                use cpal::ErrorKind::*;
                if matches!(error.kind(), DeviceNotAvailable | StreamInvalidated | DeviceChanged) {
                    METERS.lost.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|e| e.to_string())
}

fn send(state: &AudioState, cmds: impl IntoIterator<Item = Cmd>) -> Result<(), String> {
    open_output(state)?;
    let mut output = state.output.lock().unwrap();
    let output = output.as_mut().ok_or("Audio output isn't open.")?;
    for cmd in cmds {
        output.commands.push(cmd).map_err(|_| "Audio engine is busy.".to_string())?;
    }
    Ok(())
}

fn close_output(state: &AudioState) {
    if let Some(output) = state.output.lock().unwrap().take() {
        let _ = output.stop.send(());
    }
}

// ---------------------------------------------------------------------------------------------
// Commands

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
}

#[tauri::command]
pub fn audio_status(state: tauri::State<'_, AudioState>) -> Status {
    let output = state.output.lock().unwrap();
    let frames = METERS.buffer_frames.load(Ordering::Relaxed);
    let (device_id, device_name, sample_rate, requested_buffer) = match output.as_ref() {
        Some(o) => (o.device_id.clone(), o.device_name.clone(), o.sample_rate, o.requested_buffer),
        None => {
            let prefs = state.prefs.lock().unwrap();
            (prefs.device_id.clone(), String::new(), 0, prefs.buffer_frames)
        }
    };
    let running = output.is_some() && METERS.running.load(Ordering::Acquire);
    Status {
        running,
        host: host().id().name().to_string(),
        device_id,
        device_name,
        sample_rate,
        requested_buffer,
        buffer_frames: frames,
        buffer_ms: if sample_rate > 0 { frames as f64 * 1000.0 / sample_rate as f64 } else { 0.0 },
        output_latency_ms: METERS.latency_micros.load(Ordering::Relaxed) as f64 / 1000.0,
    }
}

/// Starts (or wakes) the output stream so the clock is running before anything is scheduled.
#[tauri::command]
pub fn audio_start(state: tauri::State<'_, AudioState>) -> Result<f64, String> {
    open_output(&state)?;
    Ok(engine_now())
}

/// Picks the output device and buffer size (0 = the device's default), reopening the stream.
#[tauri::command]
pub fn audio_set_output(state: tauri::State<'_, AudioState>, device_id: String, buffer_frames: u32) -> Result<(), String> {
    {
        let mut prefs = state.prefs.lock().unwrap();
        if prefs.device_id == device_id && prefs.buffer_frames == buffer_frames {
            return Ok(());
        }
        *prefs = OutputPrefs { device_id, buffer_frames };
    }
    let was_open = state.output.lock().unwrap().is_some();
    close_output(&state);
    if was_open {
        open_output(&state)?;
    }
    Ok(())
}

#[tauri::command]
pub fn audio_schedule(state: tauri::State<'_, AudioState>, clicks: Vec<Click>) -> Result<(), String> {
    send(&state, clicks.into_iter().map(Cmd::Click))
}

#[tauri::command]
pub fn audio_tone_start(
    state: tauri::State<'_, AudioState>,
    id: u32,
    freq: f32,
    wave: Wave,
    volume: f32,
    duration: Option<f32>,
) -> Result<(), String> {
    send(&state, [Cmd::ToneStart { id, freq, wave, volume, duration }])
}

#[tauri::command]
pub fn audio_tone_stop(state: tauri::State<'_, AudioState>, id: u32) -> Result<(), String> {
    send(&state, [Cmd::ToneStop { id }])
}

#[derive(Clone, Serialize)]
struct ClockTick {
    time: f64,
    latency: f64,
}

/// Reports the engine clock (and any reference tones that finished) to the window.
pub fn spawn_clock(app: AppHandle) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(20));
        if METERS.running.load(Ordering::Acquire) {
            let latency = METERS.latency_micros.load(Ordering::Relaxed) as f64 / 1e6;
            let _ = app.emit("audio-clock", ClockTick { time: engine_now(), latency });
        }
        let ended: Vec<u32> = {
            use tauri::Manager;
            let state = app.state::<AudioState>();
            let mut guard = state.ended.lock().unwrap();
            match guard.as_mut() {
                Some(consumer) => std::iter::from_fn(|| consumer.pop().ok()).collect(),
                None => Vec::new(),
            }
        };
        for id in ended {
            let _ = app.emit("audio-tone-ended", id);
        }
    });
}

// ---------------------------------------------------------------------------------------------
// Input (the tuner)

const FFT_SIZE: usize = 4096;
const FRAME_INTERVAL: Duration = Duration::from_millis(30);

#[derive(Clone, Serialize)]
pub struct InputFrame {
    freq: Option<f32>,
    level: f32,
}

#[tauri::command]
pub fn input_start(state: tauri::State<'_, AudioState>, device_id: String, on_frame: Channel<InputFrame>) -> Result<(), String> {
    input_stop(state.clone());
    let device = find_device(&device_id, true).ok_or("No audio input found.")?;
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let config: StreamConfig = supported.config();
    let format = supported.sample_format();
    let stop = Arc::new(AtomicBool::new(false));
    *state.input_stop.lock().unwrap() = Some(stop.clone());
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    thread::spawn(move || {
        let sample_rate = config.sample_rate as f32;
        let (producer, mut consumer) = rtrb::RingBuffer::<f32>::new(config.sample_rate as usize);
        let stream = match format {
            SampleFormat::F32 => build_input::<f32>(&device, config, producer),
            SampleFormat::I16 => build_input::<i16>(&device, config, producer),
            SampleFormat::I32 => build_input::<i32>(&device, config, producer),
            SampleFormat::U16 => build_input::<u16>(&device, config, producer),
            SampleFormat::F64 => build_input::<f64>(&device, config, producer),
            other => Err(format!("Unsupported sample format {other}")),
        };
        let stream = match stream.and_then(|s| s.play().map(|_| s).map_err(|e| e.to_string())) {
            Ok(stream) => stream,
            Err(error) => {
                let _ = ready_tx.send(Err(error));
                return;
            }
        };
        let _ = ready_tx.send(Ok(()));

        // The newest FFT_SIZE samples, oldest first, like an AnalyserNode's time-domain buffer.
        let mut window = vec![0.0f32; FFT_SIZE];
        let mut ordered = vec![0.0f32; FFT_SIZE];
        let mut write = 0usize;
        while !stop.load(Ordering::Acquire) {
            thread::sleep(FRAME_INTERVAL);
            while let Ok(sample) = consumer.pop() {
                window[write] = sample;
                write = (write + 1) % FFT_SIZE;
            }
            ordered[..FFT_SIZE - write].copy_from_slice(&window[write..]);
            ordered[FFT_SIZE - write..].copy_from_slice(&window[..write]);
            let rms = (ordered.iter().map(|s| s * s).sum::<f32>() / FFT_SIZE as f32).sqrt();
            // JavaScript applies the sensitivity setting; below the quietest one, don't bother.
            let freq = if rms >= 0.002 { detect_pitch(&ordered, sample_rate, 30.0, 2000.0) } else { None };
            if on_frame.send(InputFrame { freq, level: rms }).is_err() {
                break;
            }
        }
        drop(stream);
    });

    ready_rx.recv().map_err(|e| e.to_string())?
}

fn build_input<T>(device: &Device, config: StreamConfig, mut producer: rtrb::Producer<f32>) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                for frame in data.chunks(channels) {
                    let sum: f32 = frame.iter().map(|s| s.to_sample::<f32>()).sum();
                    let _ = producer.push(sum / channels as f32);
                }
            },
            |error| eprintln!("audio input error: {error}"),
            None,
        )
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn input_stop(state: tauri::State<'_, AudioState>) {
    if let Some(stop) = state.input_stop.lock().unwrap().take() {
        stop.store(true, Ordering::Release);
    }
}

/// The YIN pitch detector, ported line for line from `packages/core/pitchDetect.ts` so the
/// desktop tuner reads the same as the website's.
fn detect_pitch(buffer: &[f32], sample_rate: f32, min_hz: f32, max_hz: f32) -> Option<f32> {
    const YIN_THRESHOLD: f32 = 0.15;
    let half = buffer.len() >> 1;
    let max_tau = (half - 1).min((sample_rate / min_hz).floor() as usize);
    let min_tau = 2usize.max((sample_rate / max_hz).floor() as usize);

    let mut cmnd = vec![0.0f32; max_tau + 1];
    cmnd[0] = 1.0;
    let mut running_sum = 0.0f32;
    for tau in 1..=max_tau {
        let mut sum = 0.0f32;
        for i in 0..half {
            let delta = buffer[i] - buffer[i + tau];
            sum += delta * delta;
        }
        running_sum += sum;
        cmnd[tau] = if running_sum == 0.0 { 1.0 } else { sum * tau as f32 / running_sum };
    }

    let mut tau = min_tau;
    while tau <= max_tau {
        if cmnd[tau] < YIN_THRESHOLD {
            while tau < max_tau && cmnd[tau + 1] < cmnd[tau] {
                tau += 1;
            }
            break;
        }
        tau += 1;
    }
    if tau > max_tau {
        return None;
    }

    let prev = cmnd[tau - 1];
    let next = if tau < max_tau { cmnd[tau + 1] } else { cmnd[tau] };
    let denominator = prev + next - 2.0 * cmnd[tau];
    let shift = if denominator == 0.0 { 0.0 } else { (prev - next) / (2.0 * denominator) };
    Some(sample_rate / (tau as f32 + shift))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mixer(sample_rate: f32) -> (Mixer, rtrb::Consumer<u32>) {
        let (ended, ended_rx) = rtrb::RingBuffer::new(16);
        (Mixer { voices: [None; MAX_VOICES], sample_rate, frame: 0, start_secs: 10.0, ended }, ended_rx)
    }

    /// `cargo test -- --ignored --nocapture list_devices` prints what the device lists see.
    #[test]
    #[ignore]
    fn list_devices() {
        let host = host();
        for device in host.devices().unwrap() {
            let desc = device.description().ok();
            println!(
                "{:?} | {:?} | in={} out={} | {:?} {:?} {:?}",
                device.id().map(|i| i.to_string()),
                desc.as_ref().map(|d| d.name().to_string()),
                device.supports_input(),
                device.supports_output(),
                desc.as_ref().map(|d| d.device_type()),
                desc.as_ref().map(|d| d.interface_type()),
                desc.as_ref().map(|d| d.driver().map(str::to_string)),
            );
        }
    }

    #[test]
    fn click_lands_on_its_exact_sample() {
        let (mut m, _) = mixer(48_000.0);
        // 10.5 engine seconds = 0.5 s after this stream started = frame 24000.
        m.handle(Cmd::Click(Click { at: 10.5, wave: Wave::Sine, freq: 1000.0, gain: 0.9, length: 0.06 }));
        let out: Vec<f32> = (0..30_000).map(|_| m.next()).collect();
        let first = out.iter().position(|s| s.abs() > 1e-6).unwrap();
        // A sine starts at phase 0, so the first non-zero sample is the one right after.
        assert_eq!(first, 24_001);
        assert!(out[..24_000].iter().all(|s| *s == 0.0));
        // Gone after 0.06 s (2880 frames).
        assert!(out[24_000 + 2_880..].iter().all(|s| *s == 0.0));
        assert!(m.voices.iter().all(|v| v.is_none()));
    }

    #[test]
    fn late_click_plays_now() {
        let (mut m, _) = mixer(48_000.0);
        for _ in 0..100 {
            m.next();
        }
        m.handle(Cmd::Click(Click { at: 9.0, wave: Wave::Square, freq: 900.0, gain: 0.5, length: 0.05 }));
        // (A band-limited square starts at 0 on its first sample, then jumps.)
        let start: Vec<f32> = (0..4).map(|_| m.next()).collect();
        assert!(start.iter().any(|s| s.abs() > 0.1), "{start:?}");
    }

    #[test]
    fn decaying_tone_ends_and_reports_it() {
        let (mut m, mut ended) = mixer(48_000.0);
        m.handle(Cmd::ToneStart { id: 7, freq: 440.0, wave: Wave::Sine, volume: 0.35, duration: Some(0.5) });
        let out: Vec<f32> = (0..48_000).map(|_| m.next()).collect();
        let peak = out[..3_000].iter().fold(0.0f32, |a, s| a.max(s.abs()));
        assert!((peak - 0.35).abs() < 0.02, "peak {peak}");
        assert!(out[25_000..].iter().all(|s| *s == 0.0));
        assert_eq!(ended.pop().ok(), Some(7));
    }

    #[test]
    fn sustained_tone_holds_until_stopped() {
        let (mut m, mut ended) = mixer(48_000.0);
        m.handle(Cmd::ToneStart { id: 3, freq: 440.0, wave: Wave::Triangle, volume: 0.35, duration: None });
        let held: Vec<f32> = (0..96_000).map(|_| m.next()).collect();
        let late_peak = held[90_000..].iter().fold(0.0f32, |a, s| a.max(s.abs()));
        assert!(late_peak > 0.3, "still sounding after 2 s: {late_peak}");
        m.handle(Cmd::ToneStop { id: 3 });
        let after: Vec<f32> = (0..12_000).map(|_| m.next()).collect();
        assert!(after[7_000..].iter().all(|s| *s == 0.0));
        assert_eq!(ended.pop().ok(), Some(3));
    }

    #[test]
    fn pitch_detector_finds_a440_and_low_e() {
        for (freq, sr) in [(440.0f32, 48_000.0f32), (82.41, 44_100.0), (196.0, 48_000.0)] {
            let buf: Vec<f32> = (0..FFT_SIZE).map(|i| (TAU * freq * i as f32 / sr).sin() * 0.3).collect();
            let found = detect_pitch(&buf, sr, 30.0, 2000.0).unwrap();
            assert!((found - freq).abs() / freq < 0.002, "{freq} -> {found}");
        }
        let silence = vec![0.0f32; FFT_SIZE];
        assert_eq!(detect_pitch(&silence, 48_000.0, 30.0, 2000.0), None);
    }
}
