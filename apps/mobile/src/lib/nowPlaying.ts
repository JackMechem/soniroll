import { useSyncExternalStore } from 'react';

import { getMetricModSnapshot, stopMetricMod, subscribeMetricMod } from '@/lib/metricModulationEngine';
import { getMetronomeSnapshot, stopMetronome, subscribeMetronome } from '@/lib/metronomeEngine';
import { getRecorderSnapshot, subscribeRecorder } from '@/lib/recorderEngine';
import { getStickControlSnapshot, stopStickControl, subscribeStickControl } from '@/lib/stickControlEngine';
import { getTempoTrainerSnapshot, stopTempoTrainer, subscribeTempoTrainer } from '@/lib/tempoTrainerEngine';
import { activeToolHrefs, subscribeActiveTools } from '@/lib/toolTime';
import { getTunerSnapshot, stopTunerListening, subscribeTuner } from '@/lib/tunerEngine';

/**
 * Which tools are playing right now, wherever you are in the app — for the "now playing" pill
 * and header button (`components/NowPlaying.tsx`) and the media notification that keeps the app
 * running in the background.
 *
 * Two kinds of tool run: the ones whose engine lives on its own (the Metronome, Tempo Trainer,
 * Metric Modulation, Sticking Warmup, Tuner, Recorder — they keep going after you leave their
 * screen, so they're watched here directly, and most can be stopped from outside), and the rest,
 * which run only while their screen is open somewhere in the stack (`useToolActivity`'s set).
 * The Practice Timer has its own pill (`PracticeTimerWidget`), so it's left out.
 */

type Source = { href: string; subscribe: (fn: () => void) => () => void; running: () => boolean; stop?: () => void };

const SOURCES: Source[] = [
  { href: '/metronome', subscribe: subscribeMetronome, running: () => getMetronomeSnapshot().running, stop: stopMetronome },
  { href: '/tempo-trainer', subscribe: subscribeTempoTrainer, running: () => getTempoTrainerSnapshot().running, stop: stopTempoTrainer },
  { href: '/random-metric-modulation', subscribe: subscribeMetricMod, running: () => getMetricModSnapshot().running, stop: stopMetricMod },
  { href: '/random-sticking-warmup', subscribe: subscribeStickControl, running: () => getStickControlSnapshot().running, stop: stopStickControl },
  { href: '/tuner', subscribe: subscribeTuner, running: () => getTunerSnapshot().listening, stop: stopTunerListening },
  // Stopping a take saves it on the Recorder's screen, so the pill only takes you back there.
  { href: '/recorder', subscribe: subscribeRecorder, running: () => getRecorderSnapshot().phase !== 'idle' },
];

const LEFT_OUT = new Set(['/practice-timer']);

function subscribe(fn: () => void) {
  const offs = [...SOURCES.map((s) => s.subscribe(fn)), subscribeActiveTools(fn)];
  return () => offs.forEach((off) => off());
}

function snapshot(): string {
  const hrefs = new Set(SOURCES.filter((s) => s.running()).map((s) => s.href));
  for (const href of activeToolHrefs()) if (!LEFT_OUT.has(href)) hrefs.add(href);
  return [...hrefs].join('|');
}

export type Playing = { href: string; stop?: () => void };

/** The tools playing right now, the longest-running first as far as we know (engines first). */
export function useNowPlaying(): Playing[] {
  const key = useSyncExternalStore(subscribe, snapshot);
  if (!key) return [];
  return key.split('|').map((href) => ({ href, stop: SOURCES.find((s) => s.href === href)?.stop }));
}
