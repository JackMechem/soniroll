//! The Recorder's native side: one take from an input device, encoded to MP3 as it records.
//!
//! JavaScript (`src/native/recorderEngine.ts`) drives it the same way the website's
//! `lib/recorderEngine.ts` drives `MediaRecorder`:
//!
//! 1. `recorder_open` opens the input (the device picked in the Native audio chip), and starts
//!    sending the input level (~14 a second, like the website's meter). Nothing is kept yet except
//!    the last few seconds, so the take can start a little in the past.
//! 2. `recorder_begin` starts the take. With the metronome's count-in it passes the engine time of
//!    the first beat after the count-in, and the take starts on the exact input sample where that
//!    click was heard: the click's output delay and the input's capture delay (both reported by
//!    the audio system) are taken into account. Without it, the take starts on the sample captured
//!    at that moment.
//! 3. `recorder_stop` ends the take on the sample captured at that moment and finishes the file;
//!    `recorder_take` hands the bytes to JavaScript.
//!
//! **Why MP3** (MPEG-1 Layer III, constant bitrate, no Xing/LAME tag): it's the one compressed
//! format every browser the site supports plays and decodes (`<audio>` and `decodeAudioData`,
//! including Safari on old iPhones, which don't take WebM or Ogg Opus), the paused mobile app's
//! players too, and pure-Rust decoders like Symphonia (which has no Opus). The patents have
//! expired. 128 kb/s mono / 160 kb/s stereo is about 1 / 1.2 MB a minute, like the website's own
//! 128 kb/s takes, so the 100 MB quota lasts as long. Encoded with LAME (LGPL), built from source
//! by the `mp3lame-encoder` crate.
//!
//! MP3 adds a fixed delay at the start of the decoded audio (LAME's 576 samples plus the
//! decoder's 529). Without a LAME tag no decoder trims it, so it's the same everywhere: the
//! decoded file starts `CODEC_DELAY_FRAMES` before the take's first sample, and `recorder_begin`
//! reports the line-up (`lead`) with that included.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{Device, FromSample, SampleFormat, SizedSample, StreamConfig};
use mp3lame_encoder::{Bitrate, Builder, FlushGap, InterleavedPcm, Mode, MonoPcm, Quality};
use serde::{Deserialize, Serialize};
use tauri::ipc::{Channel, Response};

use crate::audio;

/// Encoder delay (LAME) + decoder delay (every MP3 decoder): how much earlier than the take's
/// first sample the decoded file starts.
pub const CODEC_DELAY_FRAMES: u32 = 576 + 529;
/// How far back a take can start (seconds of input kept before `recorder_begin`).
const PREROLL_SECS: f64 = 4.0;
const LEVEL_INTERVAL: Duration = Duration::from_millis(70);
/// The website's meter: RMS of the newest 2048 samples, times 4.
const LEVEL_WINDOW: usize = 2048;

// ---------------------------------------------------------------------------------------------
// MP3 encoding

pub struct Mp3Writer {
    encoder: mp3lame_encoder::Encoder,
    channels: u8,
    out: Vec<u8>,
    frames: u64,
}

impl Mp3Writer {
    pub fn new(sample_rate: u32, channels: u8) -> Result<Self, String> {
        let err = |e: mp3lame_encoder::BuildError| format!("MP3 encoder: {e:?}");
        let mut builder = Builder::new().ok_or("MP3 encoder: out of memory")?;
        builder.set_num_channels(channels).map_err(err)?;
        builder.set_sample_rate(sample_rate).map_err(err)?;
        // MPEG-1 rates are kept as they are; anything else is resampled by LAME.
        let out_rate = match sample_rate {
            32_000 | 44_100 | 48_000 => sample_rate,
            r if r > 48_000 => 48_000,
            _ => 44_100,
        };
        builder.set_output_sample_rate(std::num::NonZeroU32::new(out_rate)).map_err(err)?;
        builder.set_brate(if channels == 1 { Bitrate::Kbps128 } else { Bitrate::Kbps160 }).map_err(err)?;
        builder.set_mode(if channels == 1 { Mode::Mono } else { Mode::JointStereo }).map_err(err)?;
        builder.set_quality(Quality::NearBest).map_err(err)?;
        // No Xing/LAME frame: browsers disagree on whether they trim the codec delay with it, and
        // a constant bitrate file has an exact length and seeks without one.
        builder.set_to_write_vbr_tag(false).map_err(err)?;
        let encoder = builder.build().map_err(err)?;
        Ok(Self { encoder, channels, out: Vec::new(), frames: 0 })
    }

    /// Interleaved samples (one value per channel per frame), nominally -1..1.
    pub fn write(&mut self, samples: &[f32]) -> Result<(), String> {
        let frames = samples.len() / self.channels as usize;
        if frames == 0 {
            return Ok(());
        }
        self.out.reserve(mp3lame_encoder::max_required_buffer_size(frames));
        let result = if self.channels == 1 {
            self.encoder.encode_to_vec(MonoPcm(samples), &mut self.out)
        } else {
            self.encoder.encode_to_vec(InterleavedPcm(&samples[..frames * 2]), &mut self.out)
        };
        result.map_err(|e| format!("MP3 encoder: {e:?}"))?;
        self.frames += frames as u64;
        Ok(())
    }

    pub fn frames(&self) -> u64 {
        self.frames
    }

    pub fn finish(mut self) -> Result<Vec<u8>, String> {
        self.out.reserve(7200);
        self.encoder.flush_to_vec::<FlushGap>(&mut self.out).map_err(|e| format!("MP3 encoder: {e:?}"))?;
        Ok(self.out)
    }
}

// ---------------------------------------------------------------------------------------------
// Processing: channel choice and auto gain

#[derive(Clone, Copy, Debug, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MonoSource {
    Mix,
    Left,
    Right,
}

/// A gentle automatic gain control, standing in for the browser's `autoGainControl`: brings
/// quiet playing up (at most +18 dB) and loud playing down towards about -12 dBFS peaks, slowly
/// enough not to pump on every note, and never boosts silence (it holds the gain below -50 dBFS).
pub struct AutoGain {
    gain: f32,
    envelope: f32,
    env_release: f32,
    gain_down: f32,
    gain_up: f32,
}

impl AutoGain {
    const TARGET: f32 = 0.25;
    const MAX_GAIN: f32 = 8.0;
    const MIN_GAIN: f32 = 0.25;
    const GATE: f32 = 0.003;

    pub fn new(sample_rate: f32) -> Self {
        let per_sample = |secs: f32| (-1.0 / (secs * sample_rate)).exp();
        Self {
            gain: 1.0,
            envelope: 0.0,
            env_release: per_sample(0.4),
            gain_down: per_sample(0.02),
            gain_up: per_sample(2.0),
        }
    }

    /// `peak` is the frame's loudest channel; returns the gain to apply to it.
    fn next(&mut self, peak: f32) -> f32 {
        self.envelope = if peak > self.envelope { peak } else { self.envelope * self.env_release };
        if self.envelope > Self::GATE {
            let want = (Self::TARGET / self.envelope).clamp(Self::MIN_GAIN, Self::MAX_GAIN);
            let coeff = if want < self.gain { self.gain_down } else { self.gain_up };
            self.gain = want + (self.gain - want) * coeff;
        }
        self.gain
    }
}

/// Rounds off anything that would still clip after the gain (only above 0.8).
fn soft_clip(x: f32) -> f32 {
    let a = x.abs();
    if a <= 0.8 {
        x
    } else {
        x.signum() * (0.8 + 0.2 * ((a - 0.8) / 0.2).tanh())
    }
}

pub struct Processor {
    in_channels: usize,
    mono: Option<MonoSource>,
    auto_gain: Option<AutoGain>,
}

impl Processor {
    pub fn new(in_channels: usize, mono: Option<MonoSource>, auto_gain: bool, sample_rate: f32) -> Self {
        Self { in_channels: in_channels.clamp(1, 2), mono, auto_gain: auto_gain.then(|| AutoGain::new(sample_rate)) }
    }

    /// One channel for a mono input or in mono mode, else two.
    pub fn out_channels(&self) -> usize {
        if self.in_channels == 1 || self.mono.is_some() {
            1
        } else {
            2
        }
    }

    /// One input frame (`in_channels` values) to `out`.
    pub fn process(&mut self, frame: &[f32], out: &mut Vec<f32>) {
        let (l, r) = if self.in_channels == 1 { (frame[0], frame[0]) } else { (frame[0], frame[1]) };
        let (a, b) = match (self.out_channels(), self.mono) {
            (2, _) => (l, r),
            // A mono input has no right side: every choice is its one channel.
            (_, Some(MonoSource::Left)) => (l, 0.0),
            (_, Some(MonoSource::Right)) => (r, 0.0),
            // Like Web Audio's down-mix: the average.
            (_, _) => ((l + r) * 0.5, 0.0),
        };
        let gain = match self.auto_gain.as_mut() {
            Some(agc) => agc.next(a.abs().max(b.abs())),
            None => 1.0,
        };
        out.push(soft_clip(a * gain));
        if self.out_channels() == 2 {
            out.push(soft_clip(b * gain));
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Assembling the take: which frames go in

/// Where the processed frames go once the take has started.
pub trait TakeSink {
    fn write(&mut self, samples: &[f32]) -> Result<(), String>;
}

impl TakeSink for Mp3Writer {
    fn write(&mut self, samples: &[f32]) -> Result<(), String> {
        Mp3Writer::write(self, samples)
    }
}

/// Keeps the last few seconds of processed input until the take starts, then passes everything
/// from the start frame to the end frame on to the sink. Frame numbers count from the first frame
/// the input delivered.
pub struct TakeAssembler {
    channels: usize,
    history: VecDeque<f32>,
    /// Frame number of the first frame in `history`.
    history_start: u64,
    max_history: usize,
    start: Option<u64>,
    end: Option<u64>,
    written: u64,
}

impl TakeAssembler {
    pub fn new(channels: usize, max_history_frames: usize) -> Self {
        Self {
            channels,
            history: VecDeque::new(),
            history_start: 0,
            max_history: max_history_frames,
            start: None,
            end: None,
            written: 0,
        }
    }

    fn history_end(&self) -> u64 {
        self.history_start + (self.history.len() / self.channels) as u64
    }

    /// The take starts at this frame (clamped to the oldest frame still kept).
    pub fn set_start(&mut self, frame: u64) {
        self.start = Some(frame.max(self.history_start));
    }

    pub fn set_end(&mut self, frame: u64) {
        self.end = Some(frame);
    }

    pub fn started(&self) -> bool {
        self.start.is_some()
    }

    /// Every frame up to the end has gone to the sink.
    pub fn finished(&self) -> bool {
        match (self.start, self.end) {
            (Some(start), Some(end)) => self.history_start >= end.max(start),
            (None, Some(_)) => true,
            _ => false,
        }
    }

    pub fn frames_written(&self) -> u64 {
        self.written
    }

    pub fn push(&mut self, samples: &[f32], sink: &mut impl TakeSink) -> Result<(), String> {
        self.history.extend(samples.iter().copied());
        let Some(start) = self.start else {
            let excess = (self.history.len() / self.channels).saturating_sub(self.max_history);
            self.history.drain(..excess * self.channels);
            self.history_start += excess as u64;
            return Ok(());
        };
        // Drop what's before the start.
        if self.history_start < start {
            let skip = (start - self.history_start).min((self.history.len() / self.channels) as u64);
            self.history.drain(..skip as usize * self.channels);
            self.history_start += skip;
        }
        if self.history_start < start {
            return Ok(());
        }
        let until = self.end.map_or(self.history_end(), |end| end.min(self.history_end()));
        let frames = until.saturating_sub(self.history_start) as usize;
        if frames > 0 {
            let chunk: Vec<f32> = self.history.drain(..frames * self.channels).collect();
            sink.write(&chunk)?;
            self.history_start += frames as u64;
            self.written += frames as u64;
        }
        if self.end.is_some_and(|end| self.history_start >= end) {
            self.history.clear();
        }
        Ok(())
    }
}

/// Maps capture times to frame numbers, from the input callbacks' reports.
#[derive(Clone, Copy, Debug)]
pub struct Marker {
    /// Frame number of the first frame of a callback's buffer.
    frame: u64,
    /// When that frame was captured, in `audio::now_nanos()` terms.
    nanos: u64,
}

pub fn frame_at(marker: Marker, nanos: u64, sample_rate: f64) -> u64 {
    let delta = nanos as f64 - marker.nanos as f64;
    (marker.frame as f64 + delta * sample_rate / 1e9).round().max(0.0) as u64
}

// ---------------------------------------------------------------------------------------------
// The session

struct Shared {
    cancel: AtomicBool,
    /// Capture time the take starts / ends at (`audio::now_nanos()` terms; 0 = not yet).
    begin_nanos: AtomicU64,
    end_nanos: AtomicU64,
    input_latency_micros: AtomicU32,
    failed: AtomicBool,
}

struct Take {
    mp3: Vec<u8>,
    frames: u64,
}

struct Session {
    shared: Arc<Shared>,
    done: Option<mpsc::Receiver<Result<Take, String>>>,
    sample_rate: u32,
}

#[derive(Default)]
pub struct RecorderState {
    session: Mutex<Option<Session>>,
    take: Mutex<Option<Vec<u8>>>,
}

#[derive(Serialize)]
pub struct OpenInfo {
    sample_rate: u32,
    channels: usize,
    device_name: String,
    input_latency_ms: f64,
}

fn cancel_session(state: &RecorderState) {
    if let Some(session) = state.session.lock().unwrap().take() {
        session.shared.cancel.store(true, Ordering::Release);
    }
}

/// Opens the input and starts metering. `mono`: null records the input's own channels (up to
/// two); otherwise one channel from both sides mixed, or just the left or right.
#[tauri::command]
pub fn recorder_open(
    state: tauri::State<'_, RecorderState>,
    device_id: String,
    mono: Option<MonoSource>,
    auto_gain: bool,
    on_level: Channel<f32>,
) -> Result<OpenInfo, String> {
    cancel_session(&state);
    *state.take.lock().unwrap() = None;
    // `SONIROLL_AUDIO_INPUT=<device id>` forces the input (for testing against a loopback "mic"
    // without ever opening a real one), like `SONIROLL_AUDIO_OUTPUT` does for the output.
    let forced = std::env::var("SONIROLL_AUDIO_INPUT").ok().filter(|id| !id.is_empty());
    if let Some(forced) = &forced {
        eprintln!("recorder: asked for input {device_id:?}, opening {forced:?} (SONIROLL_AUDIO_INPUT)");
    }
    let strict = forced.is_some();
    let device_id = forced.unwrap_or(device_id);
    let device = audio::find_device(&device_id, true).ok_or("No microphone or audio input found.")?;
    // Forced: never fall back to the default (that's the real microphone).
    if strict && device.id().map(|id| id.to_string()).ok().as_deref() != Some(device_id.as_str()) {
        return Err(format!("SONIROLL_AUDIO_INPUT: no input {device_id:?}"));
    }
    let device_name = device.description().map(|d| d.name().to_string()).unwrap_or_default();
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let config: StreamConfig = supported.config();
    let format = supported.sample_format();
    let sample_rate = config.sample_rate;
    let in_channels = config.channels as usize;
    let processor = Processor::new(in_channels, mono, auto_gain, sample_rate as f32);
    let out_channels = processor.out_channels();
    let shared = Arc::new(Shared {
        cancel: AtomicBool::new(false),
        begin_nanos: AtomicU64::new(0),
        end_nanos: AtomicU64::new(0),
        input_latency_micros: AtomicU32::new(0),
        failed: AtomicBool::new(false),
    });
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
    let (done_tx, done_rx) = mpsc::channel::<Result<Take, String>>();
    let worker_shared = shared.clone();

    // cpal streams aren't `Send` on every platform, so the stream lives on this thread.
    thread::spawn(move || {
        let kept = in_channels.min(2);
        let (producer, consumer) = rtrb::RingBuffer::<f32>::new(sample_rate as usize * 4 * kept);
        let (markers_tx, markers_rx) = rtrb::RingBuffer::<Marker>::new(4096);
        let callback_shared = worker_shared.clone();
        let stream = match format {
            SampleFormat::F32 => build_input::<f32>(&device, config, producer, markers_tx, callback_shared),
            SampleFormat::I16 => build_input::<i16>(&device, config, producer, markers_tx, callback_shared),
            SampleFormat::I32 => build_input::<i32>(&device, config, producer, markers_tx, callback_shared),
            SampleFormat::U16 => build_input::<u16>(&device, config, producer, markers_tx, callback_shared),
            SampleFormat::F64 => build_input::<f64>(&device, config, producer, markers_tx, callback_shared),
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
        let result = run_worker(&worker_shared, consumer, markers_rx, processor, kept, sample_rate, &on_level);
        drop(stream);
        if let Some(result) = result {
            let _ = done_tx.send(result);
        }
    });

    ready_rx.recv().map_err(|e| e.to_string())??;
    // The first callback reports the capture delay.
    let waited = Instant::now();
    while shared.input_latency_micros.load(Ordering::Acquire) == 0 && waited.elapsed() < Duration::from_millis(200) {
        thread::sleep(Duration::from_millis(5));
    }
    let input_latency_ms = shared.input_latency_micros.load(Ordering::Acquire).saturating_sub(1) as f64 / 1000.0;
    eprintln!("recorder: {device_name}, {sample_rate} Hz, {in_channels} ch {format}, capture delay {input_latency_ms:.1} ms");
    *state.session.lock().unwrap() = Some(Session { shared, done: Some(done_rx), sample_rate });
    Ok(OpenInfo { sample_rate, channels: out_channels, device_name, input_latency_ms })
}

fn build_input<T>(
    device: &Device,
    config: StreamConfig,
    mut producer: rtrb::Producer<f32>,
    mut markers: rtrb::Producer<Marker>,
    shared: Arc<Shared>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels as usize;
    let kept = channels.min(2);
    let mut frames_seen: u64 = 0;
    let error_shared = shared.clone();
    device
        .build_input_stream(
            config,
            move |data: &[T], info: &cpal::InputCallbackInfo| {
                let ts = info.timestamp();
                let delay = ts.callback.duration_since(ts.capture);
                let now = audio::now_nanos();
                // (+1 so a zero delay still reads as "reported".)
                shared.input_latency_micros.store(delay.as_micros() as u32 + 1, Ordering::Release);
                let _ = markers.push(Marker { frame: frames_seen, nanos: now.saturating_sub(delay.as_nanos() as u64) });
                for frame in data.chunks(channels) {
                    for sample in &frame[..kept] {
                        // Dropped only if the worker stalls for seconds; the frame count stays right.
                        let _ = producer.push(sample.to_sample::<f32>());
                    }
                }
                frames_seen += (data.len() / channels) as u64;
            },
            move |error| {
                eprintln!("recorder input error: {error}");
                use cpal::ErrorKind::*;
                if matches!(error.kind(), DeviceNotAvailable | StreamInvalidated) {
                    error_shared.failed.store(true, Ordering::Release);
                }
            },
            None,
        )
        .map_err(|e| e.to_string())
}

/// Runs until the take is finished (returns it) or the session is cancelled (returns None).
fn run_worker(
    shared: &Shared,
    mut samples: rtrb::Consumer<f32>,
    mut markers: rtrb::Consumer<Marker>,
    mut processor: Processor,
    in_channels: usize,
    sample_rate: u32,
    on_level: &Channel<f32>,
) -> Option<Result<Take, String>> {
    let out_channels = processor.out_channels();
    let mut assembler = TakeAssembler::new(out_channels, (PREROLL_SECS * sample_rate as f64) as usize);
    let mut writer = match Mp3Writer::new(sample_rate, out_channels as u8) {
        Ok(writer) => writer,
        Err(error) => return Some(Err(error)),
    };
    let mut marker: Option<Marker> = None;
    let mut raw: Vec<f32> = Vec::new();
    let mut processed: Vec<f32> = Vec::new();
    let mut meter: VecDeque<f32> = VecDeque::with_capacity(LEVEL_WINDOW);
    let mut last_level = Instant::now();
    let mut stop_asked: Option<Instant> = None;

    loop {
        thread::sleep(Duration::from_millis(10));
        if shared.cancel.load(Ordering::Acquire) {
            return None;
        }
        while let Ok(m) = markers.pop() {
            marker = Some(m);
        }
        raw.clear();
        while let Ok(s) = samples.pop() {
            raw.push(s);
        }
        processed.clear();
        for frame in raw.chunks_exact(in_channels) {
            processor.process(frame, &mut processed);
        }
        for frame in processed.chunks_exact(out_channels) {
            if meter.len() == LEVEL_WINDOW {
                meter.pop_front();
            }
            meter.push_back(frame.iter().sum::<f32>() / out_channels as f32);
        }

        if let Some(m) = marker {
            let begin = shared.begin_nanos.load(Ordering::Acquire);
            if begin != 0 && !assembler.started() {
                assembler.set_start(frame_at(m, begin, sample_rate as f64));
            }
            let end = shared.end_nanos.load(Ordering::Acquire);
            if end != 0 && stop_asked.is_none() {
                stop_asked = Some(Instant::now());
                assembler.set_end(frame_at(m, end, sample_rate as f64));
            }
        } else if shared.end_nanos.load(Ordering::Acquire) != 0 && stop_asked.is_none() {
            // Never heard from the input at all.
            stop_asked = Some(Instant::now());
            assembler.set_end(0);
        }
        if let Err(error) = assembler.push(&processed, &mut writer) {
            return Some(Err(error));
        }

        if last_level.elapsed() >= LEVEL_INTERVAL {
            last_level = Instant::now();
            let rms = (meter.iter().map(|s| s * s).sum::<f32>() / meter.len().max(1) as f32).sqrt();
            if on_level.send((rms * 4.0).min(1.0)).is_err() {
                return None;
            }
        }

        // Done: everything up to the end is in, or the input stopped delivering (unplugged).
        let timed_out = stop_asked.is_some_and(|at| at.elapsed() > Duration::from_millis(750));
        if assembler.finished() || timed_out || (stop_asked.is_some() && shared.failed.load(Ordering::Acquire)) {
            let frames = assembler.frames_written().max(writer.frames());
            return Some(writer.finish().map(|mp3| Take { mp3, frames }));
        }
    }
}

/// Starts the take. `at`: the engine time of a scheduled click (the first beat after the
/// count-in); the take starts on the input sample where that click was heard. Without it (or with
/// the output stopped), it starts on the sample captured now. Returns how many seconds before now
/// the decoded file's first sample was captured (including the MP3 codec delay), for lining the
/// take up with a song.
#[tauri::command]
pub fn recorder_begin(state: tauri::State<'_, RecorderState>, at: Option<f64>) -> Result<f64, String> {
    let session = state.session.lock().unwrap();
    let session = session.as_ref().ok_or("The recorder isn't open.")?;
    let now = audio::now_nanos();
    let begin = at.and_then(audio::heard_nanos).unwrap_or(now).max(1);
    session.shared.begin_nanos.store(begin, Ordering::Release);
    let codec = CODEC_DELAY_FRAMES as f64 / session.sample_rate as f64;
    Ok((now as f64 - begin as f64) / 1e9 + codec)
}

#[derive(Serialize)]
pub struct StopInfo {
    duration_sec: f64,
    bytes: usize,
}

/// Ends the take on the sample captured now and finishes the MP3; `recorder_take` returns it.
#[tauri::command]
pub async fn recorder_stop(state: tauri::State<'_, RecorderState>) -> Result<StopInfo, String> {
    let (done, sample_rate) = {
        let mut session = state.session.lock().unwrap();
        let session = session.as_mut().ok_or("The recorder isn't open.")?;
        session.shared.end_nanos.store(audio::now_nanos().max(1), Ordering::Release);
        (session.done.take().ok_or("The take is already finishing.")?, session.sample_rate)
    };
    let result = tauri::async_runtime::spawn_blocking(move || done.recv_timeout(Duration::from_secs(10)))
        .await
        .map_err(|e| e.to_string())?;
    *state.session.lock().unwrap() = None;
    let take = result.map_err(|_| "The recording didn't finish.".to_string())??;
    let info = StopInfo { duration_sec: take.frames as f64 / sample_rate as f64, bytes: take.mp3.len() };
    dump_for_tests(&take.mp3, info.duration_sec);
    *state.take.lock().unwrap() = Some(take.mp3);
    Ok(info)
}

/// `SONIROLL_RECORDER_DUMP=<folder>` also saves every finished take there, so a test can check
/// the file without signing in to save it (like `SONIROLL_AUDIO_OUTPUT` in audio.rs).
fn dump_for_tests(mp3: &[u8], duration_sec: f64) {
    let Some(dir) = std::env::var_os("SONIROLL_RECORDER_DUMP").filter(|d| !d.is_empty()) else { return };
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = std::path::Path::new(&dir).join(format!("take-{stamp}-{duration_sec:.3}s.mp3"));
    if let Err(error) = std::fs::write(&path, mp3) {
        eprintln!("recorder: couldn't write {}: {error}", path.display());
    }
}

/// The finished take's MP3 bytes (an `ArrayBuffer` in JavaScript). Once.
#[tauri::command]
pub fn recorder_take(state: tauri::State<'_, RecorderState>) -> Response {
    Response::new(state.take.lock().unwrap().take().unwrap_or_default())
}

/// Closes the input without keeping anything (stopped during the count-in).
#[tauri::command]
pub fn recorder_cancel(state: tauri::State<'_, RecorderState>) {
    cancel_session(&state);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    /// Decodes with LAME's own decoder (mpglib; the `decoder` feature is on for tests only).
    fn decode(mp3: &[u8], channels: usize) -> Vec<Vec<f32>> {
        use mp3lame_encoder::ffi;
        let capacity = mp3.len() * 100 + 48_000;
        let mut left = vec![0i16; capacity];
        let mut right = vec![0i16; capacity];
        let mut n = 0usize;
        unsafe {
            let hip = ffi::hip_decode_init();
            // Fed in pieces, like LAME's own frontend: each call returns at most one frame.
            for chunk in mp3.chunks(512) {
                let mut chunk = chunk.to_vec();
                let mut len = chunk.len();
                loop {
                    let got = ffi::hip_decode1(hip, chunk.as_mut_ptr(), len, left[n..].as_mut_ptr(), right[n..].as_mut_ptr());
                    assert!(got >= 0, "decode error");
                    if got == 0 {
                        break;
                    }
                    n += got as usize;
                    len = 0;
                }
            }
            ffi::hip_decode_exit(hip);
        }
        assert!(n > 0, "decoded nothing");
        let to_f = |v: &[i16]| v[..n].iter().map(|s| *s as f32 / 32768.0).collect::<Vec<f32>>();
        if channels == 1 {
            vec![to_f(&left)]
        } else {
            vec![to_f(&left), to_f(&right)]
        }
    }

    fn zero_crossing_freq(signal: &[f32], sample_rate: f32) -> f32 {
        let crossings = signal.windows(2).filter(|w| w[0] < 0.0 && w[1] >= 0.0).count();
        crossings as f32 * sample_rate / signal.len() as f32
    }

    fn tone(freq: f32, sample_rate: f32, frames: usize, amp: f32) -> Vec<f32> {
        (0..frames).map(|i| (TAU * freq * i as f32 / sample_rate).sin() * amp).collect()
    }

    #[test]
    fn mono_mp3_round_trip_keeps_pitch_and_length() {
        let sr = 48_000.0;
        let input = tone(440.0, sr, 96_000, 0.5);
        let mut writer = Mp3Writer::new(48_000, 1).unwrap();
        for chunk in input.chunks(480) {
            writer.write(chunk).unwrap();
        }
        assert_eq!(writer.frames(), 96_000);
        let mp3 = writer.finish().unwrap();
        // 128 kb/s: 2 s is about 32 kB.
        assert!((30_000..36_000).contains(&mp3.len()), "{} bytes", mp3.len());
        assert_eq!(&mp3[..2], &[0xFF, 0xFB], "MPEG-1 Layer III frame first, no ID3/Xing");
        let decoded = &decode(&mp3, 1)[0];
        // The whole take plus the codec delay, rounded up to whole 1152-sample frames.
        assert!(decoded.len() >= 96_000 + CODEC_DELAY_FRAMES as usize, "{}", decoded.len());
        assert!(decoded.len() < 96_000 + CODEC_DELAY_FRAMES as usize + 2 * 1152, "{}", decoded.len());
        let middle = &decoded[10_000..80_000];
        let freq = zero_crossing_freq(middle, sr);
        assert!((freq - 440.0).abs() < 1.0, "{freq}");
        let peak = middle.iter().fold(0.0f32, |a, s| a.max(s.abs()));
        assert!((peak - 0.5).abs() < 0.05, "{peak}");
    }

    #[test]
    fn stereo_mp3_keeps_each_side() {
        let sr = 44_100.0;
        let l = tone(330.0, sr, 44_100, 0.4);
        let r = tone(550.0, sr, 44_100, 0.4);
        let interleaved: Vec<f32> = l.iter().zip(&r).flat_map(|(a, b)| [*a, *b]).collect();
        let mut writer = Mp3Writer::new(44_100, 2).unwrap();
        writer.write(&interleaved).unwrap();
        let decoded = decode(&writer.finish().unwrap(), 2);
        assert!((zero_crossing_freq(&decoded[0][5_000..40_000], sr) - 330.0).abs() < 1.5);
        assert!((zero_crossing_freq(&decoded[1][5_000..40_000], sr) - 550.0).abs() < 1.5);
    }

    /// Where a short tone burst lands in the decoded file: the codec delay the recorder reports.
    #[test]
    fn codec_delay_is_what_we_report() {
        let sr = 48_000.0;
        let mut input = vec![0.0f32; 48_000];
        let burst_at = 12_000;
        let burst: Vec<f32> = (0..2_400)
            .map(|i| {
                let w = 0.5 - 0.5 * (TAU * i as f32 / 2_400.0).cos();
                (TAU * 1_000.0 * i as f32 / sr).sin() * w * 0.6
            })
            .collect();
        input[burst_at..burst_at + burst.len()].copy_from_slice(&burst);
        let mut writer = Mp3Writer::new(48_000, 1).unwrap();
        writer.write(&input).unwrap();
        let decoded = &decode(&writer.finish().unwrap(), 1)[0];
        let best = (0..4_000)
            .max_by(|a, b| {
                let score = |lag: &usize| burst.iter().enumerate().map(|(i, s)| s * decoded[burst_at + lag + i]).sum::<f32>();
                score(a).total_cmp(&score(b))
            })
            .unwrap();
        assert_eq!(best as u32, CODEC_DELAY_FRAMES, "burst decoded {best} samples late");
    }

    struct Collect(Vec<f32>);
    impl TakeSink for Collect {
        fn write(&mut self, samples: &[f32]) -> Result<(), String> {
            self.0.extend_from_slice(samples);
            Ok(())
        }
    }

    #[test]
    fn take_can_start_in_the_past_and_ends_on_its_frame() {
        let mut take = TakeAssembler::new(1, 1_000);
        let mut sink = Collect(Vec::new());
        // Frames numbered by value. 3000 arrive before the start is known; 1000 are kept.
        let frames: Vec<f32> = (0..6_000).map(|i| i as f32).collect();
        take.push(&frames[..3_000], &mut sink).unwrap();
        take.set_start(2_500);
        take.push(&frames[3_000..4_000], &mut sink).unwrap();
        assert_eq!(sink.0.first(), Some(&2_500.0));
        take.set_end(4_500);
        assert!(!take.finished());
        take.push(&frames[4_000..6_000], &mut sink).unwrap();
        assert!(take.finished());
        assert_eq!(sink.0.len(), 2_000);
        assert_eq!(sink.0.last(), Some(&4_499.0));
        assert_eq!(take.frames_written(), 2_000);
    }

    #[test]
    fn take_start_in_the_future_waits_and_too_old_clamps() {
        let mut sink = Collect(Vec::new());
        let mut take = TakeAssembler::new(2, 100);
        let frames: Vec<f32> = (0..1_000).flat_map(|i| [i as f32, -(i as f32)]).collect();
        take.push(&frames[..400], &mut sink).unwrap(); // frames 0..200, keeps 100..200
        take.set_start(500);
        take.push(&frames[400..1_200], &mut sink).unwrap(); // frames 200..600
        assert_eq!(&sink.0[..2], &[500.0, -500.0]);
        assert_eq!(sink.0.len(), 200);

        let mut sink = Collect(Vec::new());
        let mut take = TakeAssembler::new(1, 100);
        let frames: Vec<f32> = (0..1_000).map(|i| i as f32).collect();
        take.push(&frames[..500], &mut sink).unwrap();
        take.set_start(10);
        take.push(&[], &mut sink).unwrap();
        assert_eq!(sink.0.first(), Some(&400.0), "the oldest frame still kept");
    }

    #[test]
    fn stopped_before_starting_is_empty() {
        let mut take = TakeAssembler::new(1, 100);
        let mut sink = Collect(Vec::new());
        take.push(&[0.1; 50], &mut sink).unwrap();
        take.set_end(40);
        assert!(take.finished());
        assert!(sink.0.is_empty());
    }

    #[test]
    fn frame_at_follows_the_markers() {
        let m = Marker { frame: 48_000, nanos: 2_000_000_000 };
        assert_eq!(frame_at(m, 2_500_000_000, 48_000.0), 72_000);
        assert_eq!(frame_at(m, 1_000_000_000, 48_000.0), 0);
        assert_eq!(frame_at(m, 1_500_000_000, 48_000.0), 24_000);
    }

    #[test]
    fn mono_choices() {
        let mut out = Vec::new();
        let mut p = Processor::new(2, Some(MonoSource::Mix), false, 48_000.0);
        p.process(&[0.0, 0.6], &mut out);
        assert_eq!(out, vec![0.3]);
        let mut p = Processor::new(2, Some(MonoSource::Right), false, 48_000.0);
        out.clear();
        p.process(&[0.1, 0.6], &mut out);
        assert_eq!(out, vec![0.6]);
        let mut p = Processor::new(2, None, false, 48_000.0);
        out.clear();
        p.process(&[0.1, 0.6], &mut out);
        assert_eq!(out, vec![0.1, 0.6]);
        // A mono input: one channel whatever's picked.
        let mut p = Processor::new(1, Some(MonoSource::Right), false, 48_000.0);
        out.clear();
        p.process(&[0.4], &mut out);
        assert_eq!((p.out_channels(), out), (1, vec![0.4]));
    }

    fn run_agc(amp: f32, secs: f32) -> f32 {
        let sr = 48_000.0;
        let mut p = Processor::new(1, None, true, sr);
        let mut out = Vec::new();
        for s in tone(220.0, sr, (secs * sr) as usize, amp) {
            p.process(&[s], &mut out);
        }
        let tail = &out[out.len() - 4_800..];
        assert!(out.iter().all(|s| s.abs() < 1.0));
        tail.iter().fold(0.0f32, |a, s| a.max(s.abs()))
    }

    #[test]
    fn auto_gain_lifts_quiet_and_tames_loud() {
        let quiet = run_agc(0.02, 8.0);
        assert!(quiet > 0.14, "quiet playing comes up: {quiet}");
        let loud = run_agc(0.95, 2.0);
        assert!(loud < 0.4, "loud playing comes down: {loud}");
        let mid = run_agc(0.25, 4.0);
        assert!((mid - 0.25).abs() < 0.03, "about right stays: {mid}");
        // Silence isn't boosted into hiss.
        let mut p = Processor::new(1, None, true, 48_000.0);
        let mut out = Vec::new();
        for _ in 0..96_000 {
            p.process(&[0.0005], &mut out);
        }
        assert!(out.last().unwrap().abs() < 0.001);
    }
}
