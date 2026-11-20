import {
  CARD_WEEKS,
  MONTH_NAMES,
  ROUTINE_COLORS,
  WEEKDAY_NAMES,
  addDays,
  fromDateKey,
  type DayAchievement,
  type ProgressCard,
} from '@jam-practice/core/practiceLog';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ReactNode, Ref } from 'react';
import Svg, { Circle, Defs, G, LinearGradient, Path, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/**
 * A shareable progress card on the phone — the website's `components/practicelog/ProgressCard.tsx`
 * drawn in SVG instead of on a canvas: a portrait 1080×1350 image (Instagram's 4:5 feed size,
 * nothing smaller than ~30px) with the headline (a streak, hours, or days practiced), three stats
 * and the range's days as coloured squares — or, for a day report, that day's time, achievements
 * and what got done. Always dark, so it looks the same wherever it's posted. The same drawing is
 * the preview and, through `react-native-svg`'s `toDataURL`, the PNG that goes to the share sheet
 * (`shareProgressCard`), so no extra native package is needed.
 */

export const REPORT_W = 1080;
export const REPORT_H = 1350;

const LEVEL_COLORS = ['rgba(255,255,255,0.07)', '#0e4429', '#006d32', '#26a641', '#39d353'];
const FLAME = 'M12 2c.6 3.2-1.2 5.1-2.7 6.8C7.8 10.5 6.5 12 6.5 14.6 6.5 18.2 9 21 12 21s5.5-2.8 5.5-6.2c0-2.3-1-3.9-2.2-5.2.1 1.6-.5 2.9-1.7 3.4.4-3.6-.6-7.4-1.6-10z';

const fmtHours = (h: number) => (h < 10 ? (Math.round(h * 10) / 10).toString() : String(Math.floor(h)));
const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);
const IN_RANGE: Record<ProgressCard['range'], string> = { week: 'this week', month: 'this month', year: 'in the past year' };

/** The card's big number, what it is, and a one-line title (the post's title, the share text). */
export function cardHeadline(card: ProgressCard): { value: string; label: string; title: string } {
  if (card.kind === 'day') {
    const d = fromDateKey(card.end);
    const when = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const m = card.report?.minutes ?? 0;
    return { value: fmtMinutes(m), label: 'practiced', title: `Practice report for ${when}: ${fmtMinutes(m)}` };
  }
  if (card.kind === 'streak') return { value: String(card.streak), label: 'day streak', title: `${card.streak}-day practice streak` };
  if (card.kind === 'hours') {
    // A year card is lifetime hours; a week or month card is that week's or month's.
    const h = fmtHours(card.range === 'year' ? card.hours : card.rangeHours);
    const unit = h === '1' ? 'hour' : 'hours';
    return card.range === 'year'
      ? { value: h, label: `${unit} practiced`, title: `${h} hours of practice` }
      : { value: h, label: `${unit} practiced ${IN_RANGE[card.range]}`, title: `${h} hours of practice ${IN_RANGE[card.range]}` };
  }
  const d = card.rangeDays;
  return { value: String(d), label: `${d === 1 ? 'day' : 'days'} practiced ${IN_RANGE[card.range]}`, title: `${d} days of practice ${IN_RANGE[card.range]}` };
}

// ---------------------------------------------------------------- text

/** Geist ExtraBold's advance widths (per 100 em) for ASCII 32–126, read from the font file — SVG
    text can't be measured before it's drawn, and the canvas version cuts and shrinks text to fit.
    The bold weight is a hair narrower, so this errs on the safe side. */
const WIDTHS = [
  22, 27, 41, 63, 68, 83, 73, 21, 34, 34, 42, 57, 25, 42, 25, 54, 70, 47, 67, 66, 67, 69, 64, 55, 68, 64, 32, 32, 55, 56, 55, 60, 98, 75, 71, 75, 72, 63, 61, 75,
  72, 31, 64, 71, 59, 93, 75, 79, 68, 78, 71, 70, 62, 71, 75, 104, 72, 65, 61, 40, 52, 40, 47, 56, 29, 61, 65, 62, 65, 62, 46, 65, 62, 29, 36, 67, 33, 91, 62, 63,
  65, 65, 44, 59, 46, 62, 63, 86, 67, 60, 60, 41, 30, 41, 52,
];

function textWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c < 127 ? WIDTHS[c - 32] : ch === '…' ? 74 : ch === '·' ? 25 : 68;
  }
  return (w / 100) * size;
}

/** Cuts text down to `max` wide with an ellipsis. */
function fit(text: string, max: number, size: number): string {
  if (textWidth(text, size) <= max) return text;
  let t = text;
  while (t.length > 1 && textWidth(`${t}…`, size) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/** Text in Geist at a canvas-style weight (700 → Bold, 800/900 → ExtraBold), on its baseline. */
function T({ x, y, size, weight, fill, anchor = 'start', children }: { x: number; y: number; size: number; weight: 700 | 800 | 900; fill: string; anchor?: 'start' | 'middle' | 'end'; children: string }) {
  return (
    <SvgText x={x} y={y} fontSize={size} fontFamily={weight === 700 ? 'Geist_700Bold' : 'Geist_800ExtraBold'} fill={fill} textAnchor={anchor}>
      {children}
    </SvgText>
  );
}

function Background({ glow, glowY }: { glow: string; glowY: number }) {
  return (
    <>
      <Defs>
        <LinearGradient id="bg" x1={0} y1={0} x2={REPORT_W * 0.6} y2={REPORT_H} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor="#0b1120" />
          <Stop offset={1} stopColor="#1e1b4b" />
        </LinearGradient>
        <RadialGradient id="glow" cx={REPORT_W / 2} cy={glowY} r={560} gradientUnits="userSpaceOnUse">
          <Stop offset={0} stopColor={glow} />
          <Stop offset={1} stopColor="#000000" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={REPORT_W} height={REPORT_H} fill="url(#bg)" />
      <Rect x={0} y={0} width={REPORT_W} height={REPORT_H} fill="url(#glow)" />
    </>
  );
}

/** The wordmark, and who on the right. */
function Top({ username }: { username: string | null }) {
  return (
    <>
      <T x={80} y={112} size={44} weight={800} fill="#ffffff">
        soniroll
      </T>
      {username ? (
        <T x={REPORT_W - 80} y={112} size={34} weight={700} fill="rgba(255,255,255,0.75)" anchor="end">
          {fit(`@${username}`, 420, 34)}
        </T>
      ) : null}
    </>
  );
}

const RANGE_TITLE = 'The past year';

/** Streak, Hours and Days cards: a huge headline, three stats, and the range's days as coloured
    squares (big day tiles for a week, a calendar for a month, the year in two blocks of weeks). */
function Milestone({ card, username }: { card: ProgressCard; username: string | null }) {
  const W = REPORT_W;
  const H = REPORT_H;
  const P = 80;
  const glow = card.kind === 'streak' ? 'rgba(249,115,22,0.30)' : card.kind === 'hours' ? 'rgba(167,139,250,0.30)' : 'rgba(57,211,83,0.22)';
  const end = fromDateKey(card.end);
  const start = fromDateKey(card.start);
  const when =
    card.kind === 'streak'
      ? `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
      : card.range === 'month'
        ? `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
        : card.range === 'week'
          ? `Week of ${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()}`
          : `${RANGE_TITLE} · ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;

  const head = cardHeadline(card);
  const x = card.kind === 'streak' ? P + 210 : P;
  let size = 230;
  while (textWidth(head.value, size) > W - P - x && size > 120) size -= 10;

  const stats: [string, string][] = [
    [String(card.best), 'best streak'],
    card.range === 'year' ? [fmtHours(card.hours), 'hours in total'] : [fmtHours(card.rangeHours), `hours ${card.range === 'week' ? 'this week' : 'this month'}`],
    [String(card.rangeDays), card.range === 'year' ? 'days this year' : `days ${card.range === 'week' ? 'this week' : 'this month'}`],
  ];
  const gapS = 20;
  const sw = (W - 2 * P - gapS * 2) / 3;

  const levelAt = (i: number) => (i < card.levels.length ? Number(card.levels[i]) || 0 : -1);
  const gy = 730;
  const areaH = 470;
  const days: ReactNode[] = [];
  if (card.range === 'week') {
    const gap = 14;
    const w = (W - 2 * P - gap * 6) / 7;
    const h = 300;
    const top = gy + (areaH - h) / 2;
    for (let i = 0; i < 7; i++) {
      const date = fromDateKey(addDays(card.start, i));
      const x0 = P + i * (w + gap);
      const lv = levelAt(i);
      const dark = lv >= 3;
      const m = card.mins?.[i];
      days.push(
        <G key={i}>
          <Rect x={x0} y={top} width={w} height={h} rx={20} fill={lv < 0 ? 'rgba(255,255,255,0.04)' : LEVEL_COLORS[lv]} />
          <T x={x0 + w / 2} y={top + 56} size={32} weight={800} anchor="middle" fill={dark ? 'rgba(0,0,0,0.6)' : lv < 0 ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)'}>
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'][date.getDay()]}
          </T>
          <T x={x0 + w / 2} y={top + 130} size={48} weight={900} anchor="middle" fill={dark ? 'rgba(0,0,0,0.85)' : lv < 0 ? 'rgba(255,255,255,0.35)' : '#ffffff'}>
            {String(date.getDate())}
          </T>
          {m !== undefined && lv >= 0 ? (
            <T x={x0 + w / 2} y={top + h - 40} size={m >= 60 ? 30 : 32} weight={800} anchor="middle" fill={dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)'}>
              {m > 0 ? (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ''}` : `${m}m`) : '–'}
            </T>
          ) : null}
        </G>,
      );
    }
  } else if (card.range === 'month') {
    const lead = start.getDay();
    const dim = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const rows = Math.ceil((lead + dim) / 7);
    const gap = 12;
    const w = (W - 2 * P - gap * 6) / 7;
    const h = Math.min(w, (areaH - gap * (rows - 1)) / rows);
    const top = gy + (areaH - (rows * h + (rows - 1) * gap)) / 2;
    for (let day = 1; day <= dim; day++) {
      const slot = lead + day - 1;
      const x0 = P + (slot % 7) * (w + gap);
      const y0 = top + Math.floor(slot / 7) * (h + gap);
      const lv = levelAt(day - 1);
      days.push(
        <G key={day}>
          <Rect x={x0} y={y0} width={w} height={h} rx={14} fill={lv < 0 ? 'rgba(255,255,255,0.04)' : LEVEL_COLORS[lv]} />
          <T x={x0 + w / 2} y={y0 + h / 2 + 11} size={30} weight={800} anchor="middle" fill={lv >= 3 ? 'rgba(0,0,0,0.7)' : lv < 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.8)'}>
            {String(day)}
          </T>
        </G>,
      );
    }
  } else {
    // The year in two blocks of weeks, one above the other, so the squares stay big.
    const half = Math.ceil(CARD_WEEKS / 2);
    const gap = 5;
    const cell = (W - 2 * P - gap * (half - 1)) / half;
    const blockH = 7 * (cell + gap) - gap;
    const between = 36;
    const top = gy + (areaH - (2 * blockH + between)) / 2;
    for (let w = 0; w < CARD_WEEKS; w++) {
      const b = w < half ? 0 : 1;
      const col = w - b * half;
      for (let d = 0; d < 7; d++) {
        const lv = levelAt(w * 7 + d);
        if (lv < 0) continue;
        days.push(<Rect key={w * 7 + d} x={P + col * (cell + gap)} y={top + b * (blockH + between) + d * (cell + gap)} width={cell} height={cell} rx={5} fill={LEVEL_COLORS[lv]} />);
      }
    }
  }

  // The key: "Less ▢▢▢▢▢ More" at the bottom right.
  const sq = 28;
  const wLess = textWidth('Less', 30);
  const wMore = textWidth('More', 30);
  const kx = W - P - (wLess + 14 + 5 * (sq + 6) - 6 + 14 + wMore);

  return (
    <>
      <Background glow={glow} glowY={380} />
      <Top username={username} />
      <T x={P} y={172} size={40} weight={700} fill="rgba(255,255,255,0.6)">
        {when}
      </T>
      {card.kind === 'streak' ? (
        <>
          <Defs>
            <LinearGradient id="flame" x1={0} y1={2} x2={0} y2={21} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor="#fdba74" />
              <Stop offset={1} stopColor="#ef4444" />
            </LinearGradient>
          </Defs>
          <G transform={`translate(${P - 8} 222) scale(9)`}>
            <Path d={FLAME} fill="url(#flame)" />
          </G>
        </>
      ) : null}
      <T x={x - 6} y={410} size={size} weight={900} fill="#ffffff">
        {head.value}
      </T>
      <T x={P} y={480} size={48} weight={800} fill="rgba(255,255,255,0.8)">
        {fit(head.label, W - 2 * P, 48)}
      </T>
      {stats.map(([v, l], i) => {
        const sx = P + i * (sw + gapS);
        const sy = 530;
        let ls = 30;
        while (textWidth(l, ls) > sw - 40 && ls > 26) ls -= 1;
        return (
          <G key={l}>
            <Rect x={sx} y={sy} width={sw} height={150} rx={24} fill="rgba(255,255,255,0.07)" />
            <T x={sx + 20} y={sy + 78} size={60} weight={900} fill="#ffffff">
              {fit(v, sw - 40, 60)}
            </T>
            <T x={sx + 20} y={sy + 122} size={ls} weight={700} fill="rgba(255,255,255,0.6)">
              {fit(l, sw - 40, ls)}
            </T>
          </G>
        );
      })}
      {days}
      <T x={P} y={H - 52} size={32} weight={700} fill="rgba(255,255,255,0.5)">
        soniroll.com
      </T>
      <T x={kx} y={H - 52} size={30} weight={700} fill="rgba(255,255,255,0.5)">
        Less
      </T>
      {LEVEL_COLORS.map((c, i) => (
        <Rect key={c} x={kx + wLess + 14 + i * (sq + 6)} y={H - 52 - 24} width={sq} height={sq} rx={6} fill={c} />
      ))}
      <T x={kx + wLess + 14 + 5 * (sq + 6) - 6 + 14} y={H - 52} size={30} weight={700} fill="rgba(255,255,255,0.5)">
        More
      </T>
    </>
  );
}

const ACHIEVEMENT_COLOR: Record<DayAchievement['kind'], string> = {
  goal: '#22c55e',
  all: '#10b981',
  routine: '#6366f1',
  streak: '#f97316',
  hours: '#a78bfa',
  best: '#f59e0b',
  first: '#06b6d4',
};

/** The daily report: the day's time and goal, the streak, up to three achievements, then what got
    done with its time. */
function DayReport({ card, username }: { card: ProgressCard; username: string | null }) {
  const W = REPORT_W;
  const H = REPORT_H;
  const P = 80;
  const report = card.report;
  const d = fromDateKey(card.end);
  const minutes = report?.minutes ?? 0;
  const goal = report?.goal ?? 0;
  const big = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  let size = 180;
  while (textWidth(big, size) > W - 2 * P && size > 120) size -= 10;

  const out: ReactNode[] = [];
  let y = 440;
  if (goal > 0) {
    const pct = Math.min(1, minutes / goal);
    const met = pct >= 1;
    out.push(
      <G key="goal">
        <Rect x={P} y={y} width={W - 2 * P} height={26} rx={13} fill="rgba(255,255,255,0.1)" />
        {pct > 0 ? <Rect x={P} y={y} width={Math.max(26, (W - 2 * P) * pct)} height={26} rx={13} fill={met ? '#22c55e' : '#818cf8'} /> : null}
        <T x={P} y={y + 72} size={34} weight={700} fill={met ? '#4ade80' : 'rgba(255,255,255,0.6)'}>
          {met ? `Daily goal done (${fmtMinutes(goal)})` : `Goal ${fmtMinutes(goal)}`}
        </T>
      </G>,
    );
    y += 96;
  }

  // Streak and achievements, as big pills that wrap side by side.
  const pills: { text: string; color: string; flame?: boolean }[] = [];
  if (card.streak > 0) pills.push({ text: `${card.streak}-day streak`, color: '#f97316', flame: true });
  for (const a of report?.achievements ?? []) {
    if (a.kind === 'goal' || a.kind === 'streak') continue; // said above / the streak pill covers it
    pills.push({ text: a.text, color: ACHIEVEMENT_COLOR[a.kind] });
  }
  let px = P;
  const PH = 66;
  pills.slice(0, 3).forEach((pill, i) => {
    const tw = Math.min(textWidth(pill.text, 32), W - 2 * P - 96);
    const w = tw + 96;
    if (px > P && px + w > W - P) {
      px = P;
      y += PH + 14;
    }
    out.push(
      <G key={`pill${i}`}>
        <Rect x={px} y={y} width={w} height={PH} rx={PH / 2} fill="rgba(255,255,255,0.08)" />
        <Circle cx={px + 33} cy={y + 33} r={21} fill={pill.color} />
        {pill.flame ? (
          <G transform={`translate(${px + 21} ${y + 19}) scale(1.05)`}>
            <Path d={FLAME} fill="#ffffff" />
          </G>
        ) : (
          <Polyline points={`${px + 24},${y + 34} ${px + 31},${y + 41} ${px + 43},${y + 26}`} fill="none" stroke="#ffffff" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        )}
        <T x={px + 68} y={y + 44} size={32} weight={800} fill="#ffffff">
          {fit(pill.text, tw, 32)}
        </T>
      </G>,
    );
    px += w + 14;
  });
  if (pills.length) y += PH;

  // What got done: a row per item, as many as fit, then "+ N more".
  const items = report?.items ?? [];
  const footer = H - 80;
  const top = y + 50;
  const rowH = 62;
  const fitRows = Math.max(1, Math.floor((footer - 56 - (top + 56)) / rowH));
  const total = items.length + (report?.more ?? 0);
  const shown = items.slice(0, total > fitRows ? fitRows - 1 : fitRows);
  const left = total - shown.length;
  out.push(<Rect key="list" x={P - 30} y={top - 20} width={W - 2 * P + 60} height={footer - 40 - (top - 20)} rx={32} fill="rgba(255,255,255,0.06)" />);
  out.push(
    <T key="listTitle" x={P} y={top + 30} size={32} weight={700} fill="rgba(255,255,255,0.55)">
      {items.length ? `${total} thing${total === 1 ? '' : 's'} done` : 'Nothing checked off'}
    </T>,
  );
  let ry = top + 56;
  shown.forEach((it, i) => {
    const time = it.minutes > 0 ? fmtMinutes(it.minutes) : '';
    const tw = time ? textWidth(time, 34) : 0;
    out.push(
      <G key={`item${i}`}>
        <Circle cx={P + 10} cy={ry + rowH / 2} r={10} fill={it.color !== null ? ROUTINE_COLORS[it.color % ROUTINE_COLORS.length] : 'rgba(255,255,255,0.4)'} />
        {time ? (
          <T x={W - P} y={ry + rowH / 2 + 12} size={34} weight={700} fill="rgba(255,255,255,0.7)" anchor="end">
            {time}
          </T>
        ) : null}
        <T x={P + 40} y={ry + rowH / 2 + 12} size={36} weight={700} fill="#ffffff">
          {fit(it.title, W - 2 * P - 40 - tw - 24, 36)}
        </T>
      </G>,
    );
    ry += rowH;
  });
  if (left > 0) {
    out.push(
      <T key="more" x={P + 40} y={ry + rowH / 2 + 12} size={34} weight={700} fill="rgba(255,255,255,0.55)">
        {`+ ${left} more`}
      </T>,
    );
  }

  return (
    <>
      <Background glow="rgba(57,211,83,0.22)" glowY={360} />
      <Top username={username} />
      <T x={P} y={172} size={40} weight={700} fill="rgba(255,255,255,0.6)">
        {`${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`}
      </T>
      <T x={P - 6} y={345} size={size} weight={900} fill="#ffffff">
        {big}
      </T>
      <T x={P} y={405} size={40} weight={700} fill="rgba(255,255,255,0.75)">
        of practice
      </T>
      {out}
      <T x={W / 2} y={H - 40} size={32} weight={700} fill="rgba(255,255,255,0.5)" anchor="middle">
        soniroll.com
      </T>
    </>
  );
}

/** The card at `width` (4:5). Pass `svgRef` to turn it into a PNG with `shareProgressCard`. */
export function ProgressCardView({ card, username, width, svgRef }: { card: ProgressCard; username: string | null; width: number; svgRef?: Ref<Svg> }) {
  return (
    <Svg
      ref={svgRef}
      width={width}
      height={(width * REPORT_H) / REPORT_W}
      viewBox={`0 0 ${REPORT_W} ${REPORT_H}`}
      style={{ borderRadius: 12, overflow: 'hidden' }}
      accessibilityRole="image"
      accessibilityLabel={cardHeadline(card).title}
    >
      {card.kind === 'day' ? <DayReport card={card} username={username} /> : <Milestone card={card} username={username} />}
    </Svg>
  );
}

/** The drawn card as a full-size PNG (base64), from the `Svg` it's showing in. */
function cardPng(svg: Svg): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Couldn't make the image.")), 8000);
    try {
      svg.toDataURL(
        (base64) => {
          clearTimeout(timer);
          if (base64) resolve(base64);
          else reject(new Error("Couldn't make the image."));
        },
        { width: REPORT_W, height: REPORT_H },
      );
    } catch {
      clearTimeout(timer);
      reject(new Error("Couldn't make the image."));
    }
  });
}

/** Saves the card as a PNG in the cache and opens the system share sheet with it (Instagram, a
    chat, Save to photos / Files…). */
export async function shareProgressCard(svg: Svg | null, card: ProgressCard) {
  if (!svg) throw new Error("Couldn't make the image.");
  if (!(await Sharing.isAvailableAsync())) throw new Error("This phone can't share images from here.");
  const base64 = await cardPng(svg);
  const file = new File(Paths.cache, `soniroll-${card.kind}-${card.range}-${card.end}.png`);
  if (file.exists) file.delete();
  file.create();
  file.write(base64, { encoding: 'base64' });
  await Sharing.shareAsync(file.uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: cardHeadline(card).title });
}
