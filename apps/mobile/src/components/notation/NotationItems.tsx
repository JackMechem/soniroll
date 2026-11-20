import { memo } from 'react';
import { Path, Rect } from 'react-native-svg';

import type { DrawItem } from '@/lib/notation/vexflowNative';

/**
 * Draws VexFlow's output (`flattenTree`'s items) inside an `<Svg>`: `'ink'` in the notation colour,
 * `'muted'` in the theme's muted colour. `color` paints everything in one colour instead (a lit
 * note drawn again over the score in the accent).
 */
export const NotationItems = memo(function NotationItems({ items, ink, muted, color }: { items: DrawItem[]; ink: string; muted: string; color?: string }) {
  return (
    <>
      {items.map((item, i) => (
        <Item key={i} item={item} ink={ink} muted={muted} color={color} />
      ))}
    </>
  );
});

function paint(value: string, ink: string, muted: string, color?: string) {
  if (value === 'none') return value;
  if (color) return color;
  return value === 'ink' ? ink : value === 'muted' ? muted : value;
}

function Item({ item, ink, muted, color }: { item: DrawItem; ink: string; muted: string; color?: string }) {
  const fill = paint(item.fill, ink, muted, color);
  const stroke = paint(item.stroke, ink, muted, color);
  if (item.kind === 'rect') {
    return <Rect x={item.x} y={item.y} width={item.width} height={item.height} fill={fill} stroke={stroke} strokeWidth={stroke === 'none' ? 0 : item.strokeWidth} />;
  }
  return (
    <Path
      d={item.d}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke === 'none' ? 0 : item.strokeWidth}
      strokeDasharray={item.strokeDasharray}
      strokeLinecap={item.strokeLinecap}
      {...(item.glyph ? { transform: `translate(${item.glyph.x}, ${item.glyph.y}) scale(${item.glyph.scale})` } : null)}
    />
  );
}

/** The items drawn for one tag (a note), or for any of a set of tags. */
export function itemsTagged(items: DrawItem[], tags: string | Set<string> | null): DrawItem[] {
  if (tags === null) return [];
  if (typeof tags === 'string') return items.filter((i) => i.tag === tags);
  if (!tags.size) return [];
  return items.filter((i) => i.tag !== undefined && tags.has(i.tag));
}
