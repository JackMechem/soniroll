//! The Time Test's microphone (`src/native/padInput.ts` on the JavaScript side).
//!
//! Every input sample goes to JavaScript, mixed to mono, in chunks of about 20 ms. Each chunk is
//! tagged with where its first sample sits on the output's clock (the time JavaScript schedules
//! clicks in): the capture time cpal reports for the callback it came from, turned into output
//! time with the bridge's clock tap (`bridge::time_heard_at`). So a click scheduled at time T and
//! heard at the mic lands on the sample tagged T, give or take the part of the round trip nobody
//! reports (the air, converters), which the Time Test's calibration measures.
//!
//! A chunk is raw bytes: the first sample's frame number (f64), its time (f64, NaN while the
//! output isn't running), then the samples (f32), all little-endian.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, StreamTrait};
use cpal::{Device, FromSample, SampleFormat, SizedSample, StreamConfig};
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};

use crate::{audio, bridge};

/// How often a chunk goes to JavaScript.
const CHUNK_INTERVAL: Duration = Duration::from_millis(20);

#[derive(Default)]
pub struct PadInputState {
    stop: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Serialize)]
pub struct PadInputInfo {
    sample_rate: u32,
    device_name: String,
}

/// A callback's first frame and when it was captured (`audio::now_nanos()` terms).
#[derive(Clone, Copy)]
struct Marker {
    frame: u64,
    nanos: u64,
}

/// One chunk's bytes: header, then the samples.
fn encode_chunk(frame: u64, time: f64, samples: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(16 + samples.len() * 4);
    out.extend_from_slice(&(frame as f64).to_le_bytes());
    out.extend_from_slice(&time.to_le_bytes());
    for s in samples {
        out.extend_from_slice(&s.to_le_bytes());
    }
    out
}

/// Capture time of `frame`, from the latest callback's marker.
fn capture_nanos(marker: Marker, frame: u64, sample_rate: f64) -> u64 {
    let delta = (frame as f64 - marker.frame as f64) / sample_rate * 1e9;
    (marker.nanos as f64 + delta).max(0.0) as u64
}

/// Opens `device_id` (or the default input) and streams it to `on_chunk` until `pad_input_close`.
#[tauri::command]
pub fn pad_input_open(
    state: tauri::State<'_, PadInputState>,
    device_id: String,
    on_chunk: Channel<InvokeResponseBody>,
) -> Result<PadInputInfo, String> {
    pad_input_close(state.clone());
    // `SONIROLL_AUDIO_INPUT=<device id>` forces the input for tests, like the Recorder's, and never
    // falls back to the default (the real microphone).
    let forced = std::env::var("SONIROLL_AUDIO_INPUT").ok().filter(|id| !id.is_empty());
    if let Some(forced) = &forced {
        eprintln!("pad input: asked for {device_id:?}, opening {forced:?} (SONIROLL_AUDIO_INPUT)");
    }
    let strict = forced.is_some();
    let device_id = forced.unwrap_or(device_id);
    let device = audio::find_device(&device_id, true).ok_or("No microphone or audio input found.")?;
    if strict && device.id().map(|id| id.to_string()).ok().as_deref() != Some(device_id.as_str()) {
        return Err(format!("SONIROLL_AUDIO_INPUT: no input {device_id:?}"));
    }
    let device_name = device.description().map(|d| d.name().to_string()).unwrap_or_default();
    let supported = device.default_input_config().map_err(|e| e.to_string())?;
    let config: StreamConfig = supported.config();
    let format = supported.sample_format();
    let sample_rate = config.sample_rate;
    let stop = Arc::new(AtomicBool::new(false));
    *state.stop.lock().unwrap() = Some(stop.clone());
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    // cpal streams aren't `Send` on every platform, so the stream lives on this thread.
    thread::spawn(move || {
        let (producer, consumer) = rtrb::RingBuffer::<f32>::new(sample_rate as usize * 4);
        let (markers_tx, markers_rx) = rtrb::RingBuffer::<Marker>::new(4096);
        let stream = match format {
            SampleFormat::F32 => build_input::<f32>(&device, config, producer, markers_tx),
            SampleFormat::I16 => build_input::<i16>(&device, config, producer, markers_tx),
            SampleFormat::I32 => build_input::<i32>(&device, config, producer, markers_tx),
            SampleFormat::U16 => build_input::<u16>(&device, config, producer, markers_tx),
            SampleFormat::F64 => build_input::<f64>(&device, config, producer, markers_tx),
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
        run_worker(&stop, consumer, markers_rx, sample_rate as f64, &on_chunk);
        drop(stream);
    });

    ready_rx.recv().map_err(|e| e.to_string())??;
    eprintln!("pad input: {device_name}, {sample_rate} Hz");
    Ok(PadInputInfo { sample_rate, device_name })
}

fn build_input<T>(
    device: &Device,
    config: StreamConfig,
    mut producer: rtrb::Producer<f32>,
    mut markers: rtrb::Producer<Marker>,
) -> Result<cpal::Stream, String>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    let channels = config.channels.max(1) as usize;
    let mut frames_seen: u64 = 0;
    device
        .build_input_stream(
            config,
            move |data: &[T], info: &cpal::InputCallbackInfo| {
                let ts = info.timestamp();
                let delay = ts.callback.duration_since(ts.capture);
                let nanos = audio::now_nanos().saturating_sub(delay.as_nanos() as u64);
                let _ = markers.push(Marker { frame: frames_seen, nanos });
                for frame in data.chunks(channels) {
                    let sum: f32 = frame.iter().map(|s| s.to_sample::<f32>()).sum();
                    // Dropped only if the worker stalls for seconds.
                    let _ = producer.push(sum / channels as f32);
                }
                frames_seen += (data.len() / channels) as u64;
            },
            |error| eprintln!("pad input error: {error}"),
            None,
        )
        .map_err(|e| e.to_string())
}

fn run_worker(
    stop: &AtomicBool,
    mut samples: rtrb::Consumer<f32>,
    mut markers: rtrb::Consumer<Marker>,
    sample_rate: f64,
    on_chunk: &Channel<InvokeResponseBody>,
) {
    let mut marker: Option<Marker> = None;
    let mut pending: Vec<f32> = Vec::with_capacity(4096);
    // Frame number of `pending[0]`.
    let mut frame: u64 = 0;
    let mut last_send = Instant::now();
    while !stop.load(Ordering::Acquire) {
        thread::sleep(Duration::from_millis(5));
        while let Ok(m) = markers.pop() {
            marker = Some(m);
        }
        while let Ok(s) = samples.pop() {
            pending.push(s);
        }
        if pending.is_empty() || last_send.elapsed() < CHUNK_INTERVAL {
            continue;
        }
        last_send = Instant::now();
        let time = marker
            .and_then(|m| bridge::time_heard_at(capture_nanos(m, frame, sample_rate)))
            .unwrap_or(f64::NAN);
        if on_chunk.send(InvokeResponseBody::Raw(encode_chunk(frame, time, &pending))).is_err() {
            break;
        }
        frame += pending.len() as u64;
        pending.clear();
    }
}

#[tauri::command]
pub fn pad_input_close(state: tauri::State<'_, PadInputState>) {
    if let Some(stop) = state.stop.lock().unwrap().take() {
        stop.store(true, Ordering::Release);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_bytes_round_trip() {
        let bytes = encode_chunk(48_000, 1.25, &[0.5, -0.25]);
        assert_eq!(bytes.len(), 16 + 8);
        assert_eq!(f64::from_le_bytes(bytes[0..8].try_into().unwrap()), 48_000.0);
        assert_eq!(f64::from_le_bytes(bytes[8..16].try_into().unwrap()), 1.25);
        assert_eq!(f32::from_le_bytes(bytes[16..20].try_into().unwrap()), 0.5);
        assert_eq!(f32::from_le_bytes(bytes[20..24].try_into().unwrap()), -0.25);
    }

    #[test]
    fn capture_time_follows_the_marker() {
        let m = Marker { frame: 1000, nanos: 5_000_000_000 };
        assert_eq!(capture_nanos(m, 1000, 48_000.0), 5_000_000_000);
        assert_eq!(capture_nanos(m, 1480, 48_000.0), 5_010_000_000);
        assert_eq!(capture_nanos(m, 520, 48_000.0), 4_990_000_000);
    }
}
