//! Audio devices and the microphone. Output goes through the Web Audio bridge (`bridge.rs`): every
//! sound, the metronome's clicks included, is one graph on one native output. This file lists the
//! devices, maps the chip's choice onto that output, and runs the one optional input stream (the
//! tuner's microphone, with its pitch detector).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, FromSample, SampleFormat, SizedSample, StreamConfig};
use serde::Serialize;
use tauri::ipc::Channel;
use web_audio_api::media_devices::{enumerate_devices_sync, MediaDeviceInfoKind};

#[derive(Default)]
pub struct AudioState {
    input_stop: Mutex<Option<Arc<AtomicBool>>>,
}

/// `SONIROLL_AUDIO_OUTPUT=<device id>` forces the output device (for testing against a silent
/// sink without ever touching the speakers). The in-app choice is ignored while it's set.
pub fn forced_output() -> Option<String> {
    std::env::var("SONIROLL_AUDIO_OUTPUT").ok().filter(|id| !id.is_empty())
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

pub fn host_name() -> String {
    host().id().name().to_string()
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

/// Exactly this device, or nothing.
fn device_by_id(host: &cpal::Host, id: &str) -> Option<Device> {
    host.device_by_id(&id.parse().ok()?)
}

pub(crate) fn find_device(id: &str, input: bool) -> Option<Device> {
    let host = host();
    if let Some(device) = device_by_id(&host, id) {
        return Some(device);
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

/// The sample rate the app's audio runs at: the output's own rate, so nothing gets resampled.
/// The forced test output if there is one, otherwise the system default.
pub fn output_sample_rate(forced: Option<&str>) -> Option<f32> {
    let host = host();
    let device = match forced {
        Some(id) => device_by_id(&host, id)?,
        None => host.default_output_device()?,
    };
    Some(device.default_output_config().ok()?.sample_rate() as f32)
}

/// `web-audio-api` names outputs its own way: by the device's description, numbered when two
/// share one. Which of the ones called `label` is ours, among outputs that have a config (the
/// ones it lists, in the same order).
fn nth_with_label(labels: &[(String, String)], label: &str, nth: usize) -> Option<String> {
    labels.iter().filter(|(_, l)| l == label).nth(nth).map(|(id, _)| id.clone())
}

/// The bridge's sink id for a device id from the chip ("" = the system default), and the name to
/// show. With `strict` (the forced test output) a device that can't be found is an error, never
/// a quiet fallback to the default (that would be the speakers).
pub fn output_sink(device_id: &str, strict: bool) -> Result<(String, String), String> {
    let host = host();
    let default_name = || {
        host.default_output_device().and_then(|d| describe(&d)).map_or("System default".into(), |d| d.label)
    };
    if device_id.is_empty() {
        return Ok((String::new(), default_name()));
    }
    let not_found = || {
        if strict {
            Err(format!("The audio output {device_id} wasn't found."))
        } else {
            Ok((String::new(), default_name()))
        }
    };
    let Some(device) = device_by_id(&host, device_id) else { return not_found() };
    let Ok(description) = device.description() else { return not_found() };
    let label = description.to_string();
    let mut nth = 0;
    for other in host.output_devices().map_err(|e| e.to_string())? {
        if other.default_output_config().is_err() {
            continue;
        }
        if other.id().ok() == device.id().ok() {
            break;
        }
        if other.description().map(|d| d.to_string()).ok().as_deref() == Some(label.as_str()) {
            nth += 1;
        }
    }
    let sinks: Vec<(String, String)> = enumerate_devices_sync()
        .into_iter()
        .filter(|d| d.kind() == MediaDeviceInfoKind::AudioOutput)
        .map(|d| (d.device_id().to_string(), d.label().to_string()))
        .collect();
    match nth_with_label(&sinks, &label, nth) {
        Some(sink) => Ok((sink, describe(&device).map_or(label, |d| d.label))),
        None => not_found(),
    }
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
pub fn input_start(
    state: tauri::State<'_, AudioState>,
    device_id: String,
    on_frame: Channel<InputFrame>,
) -> Result<(), String> {
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

fn build_input<T>(
    device: &Device,
    config: StreamConfig,
    mut producer: rtrb::Producer<f32>,
) -> Result<cpal::Stream, String>
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

// ---------------------------------------------------------------------------------------------
// Shared with the Recorder (`recorder.rs`)

fn epoch() -> Instant {
    static EPOCH: OnceLock<Instant> = OnceLock::new();
    *EPOCH.get_or_init(Instant::now)
}

/// Now, on the clock the output's timing uses (nanoseconds since `epoch()`).
pub(crate) fn now_nanos() -> u64 {
    epoch().elapsed().as_nanos() as u64
}

/// When a sound scheduled at output time `at` (the time JavaScript sees) comes out of the output
/// device, in `now_nanos()` terms. None while the output isn't running.
pub(crate) fn heard_nanos(at: f64) -> Option<u64> {
    crate::bridge::heard_nanos(at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::TAU;

    /// `cargo test -- --ignored --nocapture list_devices` prints what the device lists see, and
    /// the bridge's sink id for each output.
    #[test]
    #[ignore]
    fn list_devices() {
        let host = host();
        for device in host.devices().unwrap() {
            let desc = device.description().ok();
            let id = device.id().map(|i| i.to_string()).unwrap_or_default();
            println!(
                "{id:?} | {:?} | in={} out={} | {:?} {:?} {:?}",
                desc.as_ref().map(|d| d.name().to_string()),
                device.supports_input(),
                device.supports_output(),
                desc.as_ref().map(|d| d.device_type()),
                desc.as_ref().map(|d| d.interface_type()),
                desc.as_ref().map(|d| d.driver().map(str::to_string)),
            );
            if device.supports_output() {
                let rate = device.default_output_config().map(|c| c.sample_rate()).ok();
                println!("    sink: {:?}, rate {rate:?}", output_sink(&id, true));
            }
        }
    }

    #[test]
    fn picks_the_right_one_of_two_outputs_with_the_same_name() {
        let sinks = vec![
            ("a".to_string(), "USB Audio".to_string()),
            ("b".to_string(), "Speakers".to_string()),
            ("c".to_string(), "USB Audio".to_string()),
        ];
        assert_eq!(nth_with_label(&sinks, "USB Audio", 0).as_deref(), Some("a"));
        assert_eq!(nth_with_label(&sinks, "USB Audio", 1).as_deref(), Some("c"));
        assert_eq!(nth_with_label(&sinks, "USB Audio", 2), None);
        assert_eq!(nth_with_label(&sinks, "Headphones", 0), None);
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
