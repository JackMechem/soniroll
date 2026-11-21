/**
 * Lines a tool's intro sheet (the header's ?, `ToolIntro.tsx`) adds under "On the phone", after
 * the website's Help text: the explanations that used to sit on the tool screen as always-on
 * paragraphs (the screen keeps at most one short status line). Keyed by the tool's web href.
 */
export const INTRO_NOTES: Partial<Record<string, string[]>> = {
  '/tempo-trainer': [
    'During the silent bars nothing on the screen moves: count them and keep the tempo going until the click comes back.',
  ],
  '/random-metric-modulation': ['Idea by Rob Moreno.'],
  '/random-sticking-warmup': [
    'Tap a beat in the strip under the tempo to change its accent. New swaps in the next pattern.',
  ],
  '/practice-timer': ['Time your practice: one countdown (the quick timer), or a saved session of steps. Signed in, the time goes into your Shed Log.'],
  '/tuner': [
    "Once you've allowed the microphone, it starts listening as soon as the screen opens.",
    'Tap a note on the dial, or a string, to hear it. The octave tapped notes play in is under Reference & tone.',
  ],
  '/slow-downer': ['On the waveform: tap to seek, drag to pan, pinch to zoom, and long-press for markers and the loop.'],
  '/time-test': [
    "Calibrate first: it plays 12 clicks through the speaker and measures your phone's delay. Stay quiet while it listens. Calibrate again from the Microphone chip.",
    'Record anyway skips it and uses a guess for the delay, so the numbers can be a few milliseconds off.',
  ],
  '/note-trainer': [
    "Timed shows a note at a time to play; Listen also checks it through the mic.",
    "Before Start, the ring shows your last Listen score and your best.",
  ],
  '/scale-trainer': [
    "Timed shows a scale at a time to play; Listen also follows it through the mic.",
    "Before Start, the ring shows your last Listen score and your best.",
  ],
  '/interval-trainer': [
    "Timed shows an interval at a time to play; Listen also checks it through the mic.",
    "Before Start, the ring shows your last Listen score and your best.",
  ],
  '/guess-the-interval': [
    "During a round the answers sit at the bottom, within reach of your thumb.",
    "Before Start, the ring shows your last score and your best.",
  ],
  '/guess-the-chord': [
    "Type the chord on the keyboard at the bottom: the root, the quality, then an optional /bass, e.g. F♯Δ7 or A♭-7/D. It's shown beside the keyboard in the first round too.",
    "Before Start, the ring shows your last score and your best.",
  ],
  '/guess-the-progression': [
    "Numerals: one per chord, upper case for major, lower case for minor; with qualities on, add the quality (ii7, V7, I^7, iiø7). ♭/♯ go before a numeral.",
    "Chord names: the roots with - for minor (D- G C), or full symbols (D-7 G7 C^7) with qualities on. You're given the first chord's root.",
    "The Answer chip shows how to write it for your settings, and the first round shows it beside the keyboard.",
    "Before Start, the ring shows your last score and your best.",
  ],
  '/find-the-root': [
    "In Pick, the 12 keys sit at the bottom during a round, within reach of your thumb.",
    "Before Start, the ring shows your last score and your best.",
  ],
};

/**
 * The website's Help steps and options (by title / name) that a tool's intro sheet leaves out,
 * because the phone doesn't have them. Keyed by the tool's web href, like `INTRO_NOTES`.
 */
export const INTRO_OMIT: Partial<Record<string, { steps?: string[]; options?: string[] }>> = {
  // No recording or takes on the phone's Tuner (see `app/tool/tuner.tsx`).
  '/tuner': { steps: ['Record and look back'], options: ['Takes'] },
  // Loops can't be saved on the phone (set and clear only).
  '/slow-downer': { options: ['Loops'] },
  // Keyboard-only and website-only parts of Shed Notes (see `app/tool/shed-notes-note.tsx`).
  '/shed-notes': { options: ['Command palette', 'Export as PDF', 'Export and import', 'Vim mappings', 'Word suggestions'] },
};
