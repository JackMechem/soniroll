import { useEffect, useState } from "react";
import { HintsButton } from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import Select from "@/components/Select";
import { SettingChip } from "@/components/SettingsBar";
import { SpeakerIcon } from "@/components/tools";
import { HintsContext } from "@/lib/hints";
import { usePersistedSettings } from "@/lib/usePersistedSettings";
import { invoke, type AudioDevices, type AudioStatus } from "./native/engine";

const BUFFER_SIZES = [0, 64, 128, 256, 512, 1024];

// Per computer, not synced: devices differ from one machine to the next. `inputDeviceId` is the
// Recorder's input (read by `native/recorderEngine.ts`); the Tuner keeps its own choice.
const DEFAULTS = { outputDeviceId: "", bufferFrames: 256, inputDeviceId: "" };

function ms(value: number) {
  return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
}

/** Desktop only: which output the native engine plays through, its buffer size, and how much
    delay that adds. Sits in the bottom-right corner of the Metronome, Tuner and Recorder, next to
    the feedback button. With `input` (the Recorder) it also picks what to record from. */
export default function NativeAudioChip({ input = false }: { input?: boolean }) {
  const [prefs, setPrefs] = usePersistedSettings("jam-practice-desktop-audio", DEFAULTS);
  const [devices, setDevices] = useState<AudioDevices | null>(null);
  const [status, setStatus] = useState<AudioStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [showHints, setShowHints] = useState(false);

  // Rust ignores this when nothing changed, so it's safe on every mount.
  useEffect(() => {
    void invoke("audio_set_output", { deviceId: prefs.outputDeviceId, bufferFrames: prefs.bufferFrames });
  }, [prefs.outputDeviceId, prefs.bufferFrames]);

  useEffect(() => {
    const poll = () => void invoke<AudioStatus>("audio_status").then(setStatus);
    poll();
    const id = setInterval(poll, open ? 500 : 2000);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (open) void invoke<AudioDevices>("audio_devices").then(setDevices);
  }, [open]);

  const total = status?.running ? status.buffer_ms + status.output_latency_ms : null;
  const outputs = devices?.outputs ?? [];
  const inputs = devices?.inputs ?? [];
  // Like the Tuner: a saved input that isn't there any more falls back to the default.
  const inputId = inputs.some((d) => d.id === prefs.inputDeviceId) ? prefs.inputDeviceId : "";

  return (
    <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-[4.5rem] z-20">
      <SettingChip
        icon={SpeakerIcon}
        label="Native audio"
        value={total === null ? "Off" : ms(total)}
        title="Native audio"
        open={open}
        onOpenChange={setOpen}
        headerExtra={<HintsButton on={showHints} onToggle={() => setShowHints((on) => !on)} />}
      >
        <HintsContext.Provider value={showHints}>
          {input && (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Input</span>
                <Select
                  value={devices ? inputId : ""}
                  onChange={(inputDeviceId) => setPrefs({ inputDeviceId })}
                  options={[
                    { value: "", label: "System default" },
                    ...inputs.map((d) => ({ value: d.id, label: d.label })),
                  ]}
                />
              </label>
              <Hint>The microphone or audio interface the Recorder records from.</Hint>
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Output</span>
            <Select
              value={prefs.outputDeviceId}
              onChange={(outputDeviceId) => setPrefs({ outputDeviceId })}
              options={[
                { value: "", label: "System default" },
                ...outputs.map((d) => ({ value: d.id, label: d.label })),
              ]}
            />
          </label>
          <Hint>Where the clicks and tones play. Pick your audio interface for the lowest delay.</Hint>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-muted">Buffer size</span>
            <Select
              value={prefs.bufferFrames}
              onChange={(bufferFrames) => setPrefs({ bufferFrames })}
              options={BUFFER_SIZES.map((n) => ({ value: n, label: n === 0 ? "Device default" : `${n} samples` }))}
            />
          </label>
          <Hint>Smaller is quicker to respond. If you hear crackles, go one size up.</Hint>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-background p-3 text-sm">
            <dt className="text-muted">Playing through</dt>
            <dd className="truncate text-right font-medium">{status?.running ? status.device_name || "Default" : "Nothing yet"}</dd>
            <dt className="text-muted">Audio system</dt>
            <dd className="text-right font-medium">{status?.host ?? "…"}</dd>
            {status?.running && (
              <>
                <dt className="text-muted">Sample rate</dt>
                <dd className="text-right font-medium">{(status.sample_rate / 1000).toFixed(1)} kHz</dd>
                <dt className="text-muted">Buffer</dt>
                <dd className="text-right font-medium">
                  {status.buffer_frames} samples · {ms(status.buffer_ms)}
                </dd>
                <dt className="text-muted">Device delay</dt>
                <dd className="text-right font-medium">{ms(status.output_latency_ms)}</dd>
                <dt className="font-semibold">Total delay</dt>
                <dd className="text-right font-bold text-accent">{ms(total ?? 0)}</dd>
              </>
            )}
          </dl>
          <Hint>
            Total delay is how long a click takes from being played to leaving the speakers. A browser usually adds 20–40 ms.
          </Hint>
        </HintsContext.Provider>
      </SettingChip>
    </div>
  );
}
