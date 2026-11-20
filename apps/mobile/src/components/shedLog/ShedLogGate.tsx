import { useTabBarSpace } from '@/components/FloatingTabBar';
import { CalendarCheckIcon } from '@/components/icons';
import { SignInGateScreen } from '@/components/ui';

const POINTS = ['Routines with tasks and times', 'A day timer and a daily goal', 'Streaks, and time in the tools adds up', 'The same log on soniroll.com'];

/** The Shed Log signed out (the website's `ShedLogGate`): the app's one sign-in gate — it's for
    account holders. */
export function ShedLogGate() {
  const bottom = useTabBarSpace();
  return (
    <SignInGateScreen
      bottom={bottom}
      Icon={CalendarCheckIcon}
      title="Keep a Shed Log"
      body="Plan what to practice, check it off and watch your streak grow. Free with an account."
      points={POINTS}
    />
  );
}
