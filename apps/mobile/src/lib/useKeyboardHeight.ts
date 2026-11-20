import { useEffect, useState } from 'react';
import { AppState, Keyboard, Platform } from 'react-native';

/** The keyboard's height right now, or 0 if it isn't showing. */
function current(): number {
  return Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0;
}

/** How much of the bottom of the screen the on-screen keyboard currently covers (0 when hidden).
    Android now draws apps edge-to-edge, so `adjustResize` no longer shrinks the screen when the
    keyboard opens — a screen that needs its content above the keyboard pads itself by this.

    Starts from the keyboard's real state (a sheet opened while it's up), ignores a "shown" event
    when no keyboard is actually showing, and checks again when the app comes back to the front:
    Android sent a stray "shown" with no matching "hidden" around the system file picker, which
    left every sheet lifted over a keyboard that wasn't there. */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(current);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => setHeight(Platform.OS === 'ios' || Keyboard.isVisible() ? e.endCoordinates.height : 0));
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') setHeight(current());
    });
    return () => {
      show.remove();
      hide.remove();
      app.remove();
    };
  }, []);
  return height;
}
