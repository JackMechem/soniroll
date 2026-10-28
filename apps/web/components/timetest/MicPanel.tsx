"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Hint from "@/components/Hint";
import { OptionGroup } from "@/components/metronome/MetronomeOptions";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import { listAudioInputs, type InputDevice } from "@/lib/audioInput";
import type { Calibration } from "@/lib/timeTest/analysis";
import { sensitivityThresholdDb } from "@/lib/timeTest/onset";
import {
  METER_FLOOR_DB,
  getMicMeterServerSnapshot,
  getMicMeterSnapshot,
  holdMic,
  releaseMic,
  subscribeMicMeter,
} from "@/lib/timeTest/session";
import { STATUS_COLOR } from "@/lib/timeTest/timing";

function dbToPct(db: number) {
  return Math.min(100, Math.max(0, ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100));
}

/** The mic's live level, with the line a stroke has to cross and a flash for each stroke found. */
function LevelMeter({ sensitivity }: { sensitivity: number }) {
  const { levelDb, stroke } = useSyncExternalStore(subscribeMicMeter, getMicMeterSnapshot, getMicMeterServerSnapshot);
  const threshold = sensitivityThresholdDb(sensitivity);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="relative h-3 overflow-hidden rounded-full bg-background"
        role="meter"
        aria-label="Input level"
        aria-valuenow={Math.round(levelDb)}
        aria-valuemin={METER_FLOOR_DB}
        aria-valuemax={0}
      >
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-75" style={{ width: `${dbToPct(levelDb)}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${dbToPct(threshold)}%` }} title="Trigger level" />
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="tabular-nums">{levelDb <= METER_FLOOR_DB + 1 ? "Silent" : `${levelDb.toFixed(0)} dB`}</span>
        <span className="flex items-center gap-1.5">
          {stroke && <span key={stroke.key} className="stroke-flash inline-block h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR.good }} aria-hidden />}
          {stroke ? `Stroke heard (${stroke.db.toFixed(0)} dB)` : "Hit your pad to test"}
        </span>
      </div>
    </div>
  );
}

export default function MicPanel({
  inputDeviceId,
  setInputDeviceId,
  sensitivity,
  setSensitivity,
  latencyMs,
  setLatencyMs,
  calibrated,
  rejectBleed,
  setRejectBleed,
  calibrating,
  onCalibrate,
  lastCalibration,
  micError,
  busy,
}: {
  inputDeviceId: string;
  setInputDeviceId: (id: string) => void;
  sensitivity: number;
  setSensitivity: (v: number) => void;
  latencyMs: number;
  setLatencyMs: (v: number) => void;
  calibrated: boolean;
  rejectBleed: boolean;
  setRejectBleed: (v: boolean) => void;
  calibrating: boolean;
  onCalibrate: () => void;
  lastCalibration: Calibration | null;
  micError: string | null;
  /** The click is running or a take is recording: calibration waits. */
  busy: boolean;
}) {
  const [inputs, setInputs] = useState<InputDevice[]>([]);

  // Listen while these options are open, so the meter moves and strokes flash. Device names
  // only show once the browser has been allowed to use the mic, so list them again after.
  useEffect(() => {
    let cancelled = false;
    void holdMic("meter", inputDeviceId)
      .catch(() => {})
      .then(() => listAudioInputs())
      .then((list) => {
        if (!cancelled) setInputs(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      releaseMic("meter");
    };
  }, [inputDeviceId]);

  const deviceValue = inputs.some((d) => d.id === inputDeviceId) ? inputDeviceId : "";

  return (
    <>
      <OptionGroup title="Microphone">
        <Select
          value={deviceValue}
          onChange={setInputDeviceId}
          disabled={busy}
          options={[{ value: "", label: "Default input" }, ...inputs.map((d) => ({ value: d.id, label: d.label }))]}
        />
        {micError && <p className="text-xs text-danger">{micError}</p>}
        <Hint>Use one audio interface for both the mic and the click if you can. Two separate devices drift apart a little over a long take.</Hint>
      </OptionGroup>

      <OptionGroup title="Sensitivity" aside={<span className="text-sm font-semibold tabular-nums">{Math.round(sensitivity * 100)}%</span>}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sensitivity}
          aria-label="Stroke sensitivity"
          onChange={(e) => setSensitivity(Number(e.target.value))}
          style={{ "--progress": `${sensitivity * 100}%` } as React.CSSProperties}
          className="slider h-6 w-full"
        />
        <LevelMeter sensitivity={sensitivity} />
        <Hint>Every stroke should flash green, and nothing should when you&apos;re not playing. Raise it for soft playing, lower it if it picks up the room.</Hint>
      </OptionGroup>

      <OptionGroup
        title="Latency"
        aside={
          <span className={`text-sm font-semibold tabular-nums ${calibrated ? "" : "text-muted"}`}>
            {latencyMs.toFixed(1)} ms{calibrated ? "" : " · a guess"}
          </span>
        }
      >
        <button
          type="button"
          onClick={onCalibrate}
          disabled={busy || calibrating}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {calibrating ? "Listening… stay quiet" : calibrated ? "Calibrate again" : "Calibrate"}
        </button>
        {lastCalibration && <p className={`text-xs ${lastCalibration.ok ? "text-foreground" : "text-danger"}`}>{lastCalibration.message}</p>}
        <Hint>
          Sound takes time to get out of the speakers and back into the mic. Calibrating measures that, so a stroke right on the click scores 0 ms. Play the
          click through speakers (or hold your headphones to the mic) and stay quiet for 12 clicks.
        </Hint>
        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 text-xs text-muted">Fine-tune</span>
          <input
            type="range"
            min={-50}
            max={300}
            step={0.5}
            value={latencyMs}
            aria-label="Latency in milliseconds"
            onChange={(e) => setLatencyMs(Number(e.target.value))}
            style={{ "--progress": `${((latencyMs + 50) / 350) * 100}%` } as React.CSSProperties}
            className="slider h-6 w-full"
          />
        </div>
      </OptionGroup>

      <SwitchRow
        label="Ignore click bleed"
        checked={rejectBleed}
        onChange={setRejectBleed}
        hint="Don't count the click as a stroke when it leaks into the mic. It listens to the count-in to learn how loud the click is, so keep at least one bar of count-in."
      />
    </>
  );
}
