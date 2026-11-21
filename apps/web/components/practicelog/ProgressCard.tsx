"use client";

import { useEffect, useRef } from "react";
import { type DayAchievement, type ProgressCard, CARD_WEEKS, MONTH_NAMES, ROUTINE_COLORS, WEEKDAY_NAMES, addDays, fromDateKey } from "@/lib/practiceLog";

/**
 * A shareable progress card — a portrait 1080×1350 image (Instagram's 4:5 feed size, nothing
 * smaller than ~30px): the headline (a streak, hours practiced, or days practiced), three stats, and
 * the range's practice as colored squares like a commit graph — or, for a day report, that day's
 * time, achievements and tasks. Drawn on a canvas, so the same drawing is both the on-page preview
 * and the PNG you download or share. Always dark, so it looks the same wherever it's posted.
 */

export const CARD_W = 1200;
export const CARD_H = 630;

const LEVEL_COLORS = ["rgba(255,255,255,0.07)", "#0e4429", "#006d32", "#26a641", "#39d353"];
const FLAME = "M12 2c.6 3.2-1.2 5.1-2.7 6.8C7.8 10.5 6.5 12 6.5 14.6 6.5 18.2 9 21 12 21s5.5-2.8 5.5-6.2c0-2.3-1-3.9-2.2-5.2.1 1.6-.5 2.9-1.7 3.4.4-3.6-.6-7.4-1.6-10z";

const fmtHours = (h: number) => (h < 10 ? (Math.round(h * 10) / 10).toString() : String(Math.floor(h)));
/** Hours as a number and its unit: under an hour it's minutes ("25 min"), not "0.4 hours". */
function hoursParts(h: number): { value: string; unit: string } {
  if (h < 1) return { value: String(Math.round(h * 60)), unit: "min" };
  const value = fmtHours(h);
  return { value, unit: value === "1" ? "hour" : "hours" };
}
const IN_RANGE: Record<ProgressCard["range"], string> = { week: "this week", month: "this month", year: "in the past year" };

const fmtMinutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);

export function cardHeadline(card: ProgressCard): { value: string; label: string; title: string } {
  if (card.kind === "day") {
    const d = fromDateKey(card.end);
    const when = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    const m = card.report?.minutes ?? 0;
    return { value: fmtMinutes(m), label: "practiced", title: `Practice report for ${when}: ${fmtMinutes(m)}` };
  }
  if (card.kind === "streak") return { value: String(card.streak), label: "day streak", title: `${card.streak}-day practice streak` };
  if (card.kind === "hours") {
    // A year card is lifetime hours; a week or month card is that week's or month's.
    const { value: h, unit } = hoursParts(card.range === "year" ? card.hours : card.rangeHours);
    return card.range === "year"
      ? { value: h, label: `${unit} practiced`, title: `${h} ${unit} of practice` }
      : { value: h, label: `${unit} practiced ${IN_RANGE[card.range]}`, title: `${h} ${unit} of practice ${IN_RANGE[card.range]}` };
  }
  const d = card.rangeDays;
  return { value: String(d), label: `${d === 1 ? "day" : "days"} practiced ${IN_RANGE[card.range]}`, title: `${d} days of practice ${IN_RANGE[card.range]}` };
}

function fontFamily() {
  if (typeof document === "undefined") return "sans-serif";
  return getComputedStyle(document.body).fontFamily || "sans-serif";
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawProgressCard(canvas: HTMLCanvasElement, card: ProgressCard, username: string | null) {
  const scale = 2;
  const { w, h } = cardSize(card);
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (card.kind === "day") {
    drawDayReport(ctx, card, username);
    return;
  }
  drawMilestone(ctx, card, username);
}

const RANGE_TITLE: Record<ProgressCard["range"], string> = { week: "This week", month: "This month", year: "The past year" };

/** Streak, Hours and Days cards: portrait 1080×1350, nothing under 30px. A huge headline, three
    stats, and the range's days as colored squares (big day tiles for a week, a calendar for a
    month, the year in two blocks of 26–27 weeks). */
function drawMilestone(ctx: CanvasRenderingContext2D, card: ProgressCard, username: string | null) {
  const W = REPORT_W;
  const H = REPORT_H;
  const P = 80;
  const font = fontFamily();
  const f = (weight: number, size: number) => `${weight} ${size}px ${font}`;
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, "#0b1120");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glowColor = card.kind === "streak" ? "rgba(249,115,22,0.30)" : card.kind === "hours" ? "rgba(167,139,250,0.30)" : "rgba(57,211,83,0.22)";
  const glow = ctx.createRadialGradient(W / 2, 380, 10, W / 2, 380, 560);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Top: wordmark, who, and the range.
  ctx.fillStyle = "#ffffff";
  ctx.font = f(800, 44);
  ctx.fillText("soniroll", P, 112);
  if (username) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = f(700, 34);
    ctx.fillText(fit(ctx, `@${username}`, 420), W - P, 112);
    ctx.textAlign = "left";
  }
  const end = fromDateKey(card.end);
  const start = fromDateKey(card.start);
  const when =
    card.range === "month"
      ? `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`
      : card.range === "week"
        ? `Week of ${MONTH_NAMES[start.getMonth()].slice(0, 3)} ${start.getDate()}`
        : `${RANGE_TITLE.year} · ${MONTH_NAMES[end.getMonth()].slice(0, 3)} ${end.getDate()}, ${end.getFullYear()}`;
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = f(700, 40);
  ctx.fillText(card.kind === "streak" ? `${MONTH_NAMES[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}` : when, P, 172);

  // The headline: a flame for a streak, then the number, huge, and what it is.
  const head = cardHeadline(card);
  let x = P;
  if (card.kind === "streak") {
    ctx.save();
    ctx.translate(P - 8, 222);
    ctx.scale(9, 9);
    const fl = ctx.createLinearGradient(0, 2, 0, 21);
    fl.addColorStop(0, "#fdba74");
    fl.addColorStop(1, "#ef4444");
    ctx.fillStyle = fl;
    ctx.fill(new Path2D(FLAME));
    ctx.restore();
    x = P + 210;
  }
  let size = 230;
  ctx.font = f(900, size);
  while (ctx.measureText(head.value).width > W - P - x && size > 120) ctx.font = f(900, (size -= 10));
  ctx.fillStyle = "#ffffff";
  ctx.fillText(head.value, x - 6, 410);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = f(800, 48);
  ctx.fillText(fit(ctx, head.label, W - 2 * P), P, 480);

  // Three stats.
  const time = hoursParts(card.range === "year" ? card.hours : card.rangeHours);
  const stats: [string, string][] = [
    [String(card.best), "best streak"],
    [time.value, card.range === "year" ? `${time.unit} in total` : `${time.unit} ${card.range === "week" ? "this week" : "this month"}`],
    [String(card.rangeDays), card.range === "year" ? "days this year" : `days ${card.range === "week" ? "this week" : "this month"}`],
  ];
  const gapS = 20;
  const sw = (W - 2 * P - gapS * 2) / 3;
  stats.forEach(([v, l], i) => {
    const sx = P + i * (sw + gapS);
    const sy = 530;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    roundRect(ctx, sx, sy, sw, 150, 24);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = f(900, 60);
    ctx.fillText(fit(ctx, v, sw - 40), sx + 20, sy + 78);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    let ls = 30;
    ctx.font = f(700, ls);
    while (ctx.measureText(l).width > sw - 40 && ls > 26) ctx.font = f(700, (ls -= 1));
    ctx.fillText(fit(ctx, l, sw - 40), sx + 20, sy + 122);
  });

  // The days.
  const levelAt = (i: number) => (i < card.levels.length ? Number(card.levels[i]) || 0 : -1);
  const gy = 730;
  const areaH = 470;
  if (card.range === "week") {
    const gap = 14;
    const w = (W - 2 * P - gap * 6) / 7;
    const h = 300;
    const top = gy + (areaH - h) / 2;
    for (let i = 0; i < 7; i++) {
      const date = fromDateKey(addDays(card.start, i));
      const x0 = P + i * (w + gap);
      const lv = levelAt(i);
      ctx.fillStyle = lv < 0 ? "rgba(255,255,255,0.04)" : LEVEL_COLORS[lv];
      roundRect(ctx, x0, top, w, h, 20);
      ctx.fill();
      const dark = lv >= 3;
      ctx.textAlign = "center";
      ctx.fillStyle = dark ? "rgba(0,0,0,0.6)" : lv < 0 ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)";
      ctx.font = f(800, 32);
      ctx.fillText(["S", "M", "T", "W", "T", "F", "S"][date.getDay()], x0 + w / 2, top + 56);
      ctx.fillStyle = dark ? "rgba(0,0,0,0.85)" : lv < 0 ? "rgba(255,255,255,0.35)" : "#ffffff";
      ctx.font = f(900, 48);
      ctx.fillText(String(date.getDate()), x0 + w / 2, top + 130);
      const m = card.mins?.[i];
      if (m !== undefined && lv >= 0) {
        ctx.fillStyle = dark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.75)";
        ctx.font = f(800, m >= 60 ? 30 : 32);
        ctx.fillText(m > 0 ? (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}` : ""}` : `${m}m`) : "–", x0 + w / 2, top + h - 40);
      }
      ctx.textAlign = "left";
    }
  } else if (card.range === "month") {
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
      ctx.fillStyle = lv < 0 ? "rgba(255,255,255,0.04)" : LEVEL_COLORS[lv];
      roundRect(ctx, x0, y0, w, h, 14);
      ctx.fill();
      ctx.fillStyle = lv >= 3 ? "rgba(0,0,0,0.7)" : lv < 0 ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.8)";
      ctx.font = f(800, 30);
      ctx.textAlign = "center";
      ctx.fillText(String(day), x0 + w / 2, y0 + h / 2 + 11);
      ctx.textAlign = "left";
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
        ctx.fillStyle = LEVEL_COLORS[lv];
        roundRect(ctx, P + col * (cell + gap), top + b * (blockH + between) + d * (cell + gap), cell, cell, 5);
        ctx.fill();
      }
    }
  }

  // Footer: the site, and the key.
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = f(700, 32);
  ctx.fillText("soniroll.com", P, H - 52);
  const sq = 28;
  ctx.font = f(700, 30);
  const wLess = ctx.measureText("Less").width;
  const wMore = ctx.measureText("More").width;
  let kx = W - P - (wLess + 14 + 5 * (sq + 6) - 6 + 14 + wMore);
  ctx.fillText("Less", kx, H - 52);
  kx += wLess + 14;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = LEVEL_COLORS[i];
    roundRect(ctx, kx + i * (sq + 6), H - 52 - 24, sq, sq, 6);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.fillText("More", kx + 5 * (sq + 6) - 6 + 14, H - 52);
}

/** Cuts text down to `max` px wide with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const ACHIEVEMENT_STYLE: Record<DayAchievement["kind"], { color: string; mark: string }> = {
  goal: { color: "#22c55e", mark: "✓" },
  all: { color: "#10b981", mark: "✓" },
  routine: { color: "#6366f1", mark: "✓" },
  streak: { color: "#f97316", mark: "" },
  hours: { color: "#a78bfa", mark: "h" },
  best: { color: "#f59e0b", mark: "★" },
  first: { color: "#06b6d4", mark: "1" },
};

/** A day report is a portrait 4:5 image (Instagram's feed size); the other cards are link-preview
    sized. */
export const REPORT_W = 1080;
export const REPORT_H = 1350;

export function cardSize(card: ProgressCard): { w: number; h: number } {
  void card;
  return { w: REPORT_W, h: REPORT_H };
}

/** The daily report, made to be read on a phone: nothing smaller than 30px. The day's time and
    goal, the streak, up to three achievements, then what got done with its time. */
function drawDayReport(ctx: CanvasRenderingContext2D, card: ProgressCard, username: string | null) {
  const W = REPORT_W;
  const H = REPORT_H;
  const P = 80;
  const report = card.report;
  const font = fontFamily();
  const f = (weight: number, size: number) => `${weight} ${size}px ${font}`;
  const bg = ctx.createLinearGradient(0, 0, W * 0.6, H);
  bg.addColorStop(0, "#0b1120");
  bg.addColorStop(1, "#1e1b4b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 360, 10, W / 2, 360, 560);
  glow.addColorStop(0, "rgba(57,211,83,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";

  // Top: the wordmark and the date; who, on the right.
  ctx.fillStyle = "#ffffff";
  ctx.font = f(800, 44);
  ctx.fillText("soniroll", P, 112);
  if (username) {
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = f(700, 34);
    ctx.fillText(fit(ctx, `@${username}`, 420), W - P, 112);
    ctx.textAlign = "left";
  }
  const d = fromDateKey(card.end);
  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.font = f(700, 40);
  ctx.fillText(`${WEEKDAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`, P, 172);

  // The day's time, huge, and the goal.
  const minutes = report?.minutes ?? 0;
  const goal = report?.goal ?? 0;
  ctx.fillStyle = "#ffffff";
  const big = minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
  let size = 180;
  ctx.font = f(900, size);
  while (ctx.measureText(big).width > W - 2 * P && size > 120) ctx.font = f(900, (size -= 10));
  ctx.fillText(big, P - 6, 345);
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.font = f(700, 40);
  ctx.fillText("of practice", P, 405);
  let y = 440;
  if (goal > 0) {
    const pct = Math.min(1, minutes / goal);
    const met = pct >= 1;
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    roundRect(ctx, P, y, W - 2 * P, 26, 13);
    ctx.fill();
    if (pct > 0) {
      ctx.fillStyle = met ? "#22c55e" : "#818cf8";
      roundRect(ctx, P, y, Math.max(26, (W - 2 * P) * pct), 26, 13);
      ctx.fill();
    }
    ctx.fillStyle = met ? "#4ade80" : "rgba(255,255,255,0.6)";
    ctx.font = f(700, 34);
    ctx.fillText(met ? `Daily goal done (${fmtMinutes(goal)})` : `Goal ${fmtMinutes(goal)}`, P, y + 72);
    y += 96;
  }

  // Streak and achievements, as big pills.
  const pills: { text: string; color: string; flame?: boolean }[] = [];
  if (card.streak > 0) pills.push({ text: `${card.streak}-day streak`, color: "#f97316", flame: true });
  for (const a of report?.achievements ?? []) {
    if (a.kind === "goal") continue; // already said above
    if (a.kind === "streak") continue; // the streak pill covers it
    pills.push({ text: a.text, color: ACHIEVEMENT_STYLE[a.kind].color });
  }
  // Pills wrap side by side.
  let px = P;
  const PH = 66;
  for (const pill of pills.slice(0, 3)) {
    ctx.font = f(800, 32);
    const tw = Math.min(ctx.measureText(pill.text).width, W - 2 * P - 96);
    const w = tw + 96;
    if (px > P && px + w > W - P) {
      px = P;
      y += PH + 14;
    }
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    roundRect(ctx, px, y, w, PH, PH / 2);
    ctx.fill();
    ctx.fillStyle = pill.color;
    ctx.beginPath();
    ctx.arc(px + 33, y + 33, 21, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    if (pill.flame) {
      ctx.translate(px + 21, y + 19);
      ctx.scale(1.05, 1.05);
      ctx.fillStyle = "#ffffff";
      ctx.fill(new Path2D(FLAME));
    } else {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(px + 24, y + 34);
      ctx.lineTo(px + 31, y + 41);
      ctx.lineTo(px + 43, y + 26);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = "#ffffff";
    ctx.font = f(800, 32);
    ctx.fillText(fit(ctx, pill.text, tw), px + 68, y + 44);
    px += w + 14;
  }
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
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  roundRect(ctx, P - 30, top - 20, W - 2 * P + 60, footer - 40 - (top - 20), 32);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = f(700, 32);
  ctx.fillText(items.length ? `${total} thing${total === 1 ? "" : "s"} done` : "Nothing checked off", P, top + 30);
  let ry = top + 56;
  for (const it of shown) {
    ctx.fillStyle = it.color !== null ? ROUTINE_COLORS[it.color % ROUTINE_COLORS.length] : "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(P + 10, ry + rowH / 2, 10, 0, Math.PI * 2);
    ctx.fill();
    const time = it.minutes > 0 ? fmtMinutes(it.minutes) : "";
    ctx.font = f(700, 34);
    const tw = time ? ctx.measureText(time).width : 0;
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    if (time) ctx.fillText(time, W - P, ry + rowH / 2 + 12);
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff";
    ctx.font = f(700, 36);
    ctx.fillText(fit(ctx, it.title, W - 2 * P - 40 - tw - 24), P + 40, ry + rowH / 2 + 12);
    ry += rowH;
  }
  if (left > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = f(700, 34);
    ctx.fillText(`+ ${left} more`, P + 40, ry + rowH / 2 + 12);
  }

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = f(700, 32);
  ctx.textAlign = "center";
  ctx.fillText("soniroll.com", W / 2, H - 40);
  ctx.textAlign = "left";
}

/** The card on the page (scales to its container's width). */
export function ProgressCardView({ card, username, className = "" }: { card: ProgressCard; username: string | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const draw = () => ref.current && drawProgressCard(ref.current, card, username);
    draw();
    // Redraw once web fonts have loaded, so the text isn't in a fallback face.
    void document.fonts?.ready.then(draw);
  }, [card, username]);
  return <canvas ref={ref} role="img" aria-label={cardHeadline(card).title} className={`block w-full rounded-xl mx-auto aspect-[4/5] max-w-sm ${className}`} />;
}

/** The card as a PNG file. */
export async function progressCardFile(card: ProgressCard, username: string | null): Promise<File> {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  drawProgressCard(canvas, card, username);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Couldn't make the image.");
  return new File([blob], `soniroll-${card.kind}-${card.range}-${card.end}.png`, { type: "image/png" });
}
