import { NoteDocIcon } from '@/components/shedNotes/icons';
import { SignInGateScreen } from '@/components/ui';

const POINTS = ['Notes in folders, linked with [[double brackets]]', 'Music notation, pictures and files', 'Attach notes to routines and tunes', 'The same notes on soniroll.com'];

/** Shed Notes signed out (the website's `GatedShedNotes`): notes are kept in your account, so this
    is the app's one sign-in gate. */
export function ShedNotesGate() {
  return (
    <SignInGateScreen
      Icon={NoteDocIcon}
      title="Notes for your practice"
      body="Write, link and keep notes on what you're working on. Free with an account."
      points={POINTS}
    />
  );
}
