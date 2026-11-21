import type { ReactNode } from 'react';
import { Text } from 'react-native';

/** "E♭ · 220 BPM" with the ♭ and ♯ drawn in the charts' font, inside any `<Text>`: Geist has no
    ♭/♯, and Android's fallback glyph is small and low, so it read like a subscript "b". The same
    face the key tiles and chord charts use. Text without an accidental comes back unchanged. */
export function withAccidentals(text: string | null | undefined): ReactNode {
  if (!text || !/[♭♯]/.test(text)) return text;
  return text.split(/([♭♯])/).map((part, i) =>
    part === '♭' || part === '♯' ? (
      <Text key={i} style={{ fontFamily: 'PetalumaScript', fontWeight: 'normal' }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}
