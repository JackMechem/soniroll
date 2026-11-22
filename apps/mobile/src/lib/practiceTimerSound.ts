/** The Practice Timer's synced sound settings (the website's `lib/practiceTimerSound.ts` key): what
    the timer screen edits, and what a step's tool opening (`useOpenStepTools`) reads. */
export const SOUND_SETTINGS_KEY = 'jam-practice-timer-sound-settings';
export const DEFAULT_SOUND_SETTINGS = {
  soundEnabled: true,
  alarmMode: false,
  fullScreenAlert: false,
  /** Open a step's tool (a Shed Log task's attached tool) when the step starts. */
  openTools: true,
};
