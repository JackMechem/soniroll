import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * While `active`, Back (the header's back button or Android's) runs `onBack` instead of leaving the
 * screen — for a screen with pages of its own (Score Writer's list → a score; the bass players →
 * a player → a transcription), so Back steps back a page like the website's back buttons.
 */
export function useBackWithin(active: boolean, onBack: () => void) {
  const navigation = useNavigation();
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });
  useEffect(() => {
    if (!active) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      onBackRef.current();
    });
  }, [navigation, active]);
}
