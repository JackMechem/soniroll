import {
  SNAP,
  TASK_COLOR,
  dayInfo,
  isSameDragItem,
  routineDrag,
  taskDrag,
  type Block,
  type CalendarTarget,
  type DragItem,
  layoutLanes,
} from '@jam-practice/core/practiceLogDay';
import {
  WEEKDAY_SHORT,
  formatMinutesShort,
  formatShortDate,
  formatTime,
  progressOf,
  routineSpan,
  routinesOn,
  tasksOf,
  timeString,
  weekdayOf,
  type DayRoutine,
  type DayTask,
} from '@jam-practice/core/practiceLog';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';

import { CheckIcon } from '@/components/icons';
import { DayTasks } from '@/components/shedLog/DayTasks';
import { ChecklistIcon, RoutineIcon, routineColor } from '@/components/shedLog/parts';
import { RoutineCard } from '@/components/shedLog/RoutineCard';
import { ToolSheet } from '@/components/tool/SettingChip';
import { useNowCoarse } from '@/lib/useClock';
import type { PracticeLog } from '@/lib/usePracticeLog';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/** One hour on the grid (dp) — the website's day view uses 64 px too. */
const HOUR = 64;
/** dp per minute. */
const PX = HOUR / 60;
/** The shortest a block is drawn (dp): one line of text. */
const MIN_BLOCK = 24;
const DAY_MIN = 24 * 60;
/** The hour labels down the side. */
const LABEL_W = 44;
/** How long to hold before something lifts to be dragged (the website's 350 ms). */
const HOLD_MS = 350;
/** Near the top or bottom of the grid (dp), a held drag scrolls it. */
const EDGE = 36;

/** Where a drag would land: a time (minutes into the day), or any time (null). */
type Drop = { min: number | null };
type Drag = { item: DragItem; drop: Drop | null };

/**
 * One day as a time grid (the website's `DayView`, as it works on a phone): hours down the side,
 * timed routines and the day's timed tasks as blocks where they fall (side by side when they
 * overlap), a "now" line today, and an Any time row above with everything that has no time. Tap
 * one to open it (the routine's card, or the day's tasks, in a sheet: tick tasks, start it, set a
 * time). Press and hold one to drag it to another time (snapped to 15 minutes) or onto Any time —
 * this day only (the website can also drop on another day of the week).
 */
export function DayView({ date, log, today, onDragChange }: { date: string; log: PracticeLog; today: string; onDragChange?: (dragging: boolean) => void }) {
  const { colors, derived } = useAppTheme();
  const { height: windowH } = useWindowDimensions();
  const gridH = Math.max(320, Math.round(windowH * 0.55));
  const { data } = log;
  const day = useMemo(() => dayInfo(data, date, today), [data, date, today]);
  // Lanes by the height a block is drawn (at least 24 dp), so short blocks a few minutes apart sit
  // side by side instead of covering each other.
  const blocks = useMemo(() => layoutLanes(day.blocks, (MIN_BLOCK + 2) / PX), [day.blocks]);
  const now = new Date(useNowCoarse());
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const [colW, setColW] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [open, setOpen] = useState<CalendarTarget | null>(null);
  const scroller = useRef<ScrollView>(null);
  // Where things are (from layout and scroll events), and the drag in progress — read only from
  // gesture, layout and scroll callbacks, never while rendering.
  const live = useRef({
    anyY: 0,
    gridY: 0,
    scrollY: 0,
    pills: {} as Record<string, number>,
    scrolledFor: '',
    justDragged: false,
    drag: null as null | { item: DragItem; startY: number; offset: number; y: number; drop: Drop | null; edgeSince: number; timer: ReturnType<typeof setInterval> | null },
  });

  useEffect(() => {
    const l = live.current;
    return () => {
      if (l.drag?.timer) clearInterval(l.drag.timer);
    };
  }, []);

  // ------------------------------------------------------------ dragging

  /** Where the finger is (dp from the top of this view) as a drop. */
  function dropAt(y: number, item: DragItem, offset: number): Drop | null {
    const l = live.current;
    if (y >= l.gridY && y <= l.gridY + gridH + 40) {
      const raw = (y - l.gridY + l.scrollY) / PX - offset;
      const latest = DAY_MIN - Math.min(item.minutes, 60);
      return { min: Math.max(0, Math.min(latest, Math.round(raw / SNAP) * SNAP)) };
    }
    if (y >= l.anyY - 24 && y < l.gridY) return { min: null };
    return null;
  }

  function refresh() {
    const d = live.current.drag;
    if (!d) return;
    const drop = dropAt(d.y, d.item, d.offset);
    if (drop?.min !== d.drop?.min || !drop !== !d.drop) {
      d.drop = drop;
      setDrag({ item: d.item, drop });
    }
  }

  /** A drag lifts: `y` is where the finger is, `offset` the minutes between the item's top and it. */
  function begin(item: DragItem, y: number, offset: number) {
    const l = live.current;
    if (l.drag?.timer) clearInterval(l.drag.timer);
    const drop = dropAt(y, item, offset);
    l.drag = { item, startY: y, offset, y, drop, edgeSince: 0, timer: null };
    // Held near the top or bottom of the grid, it scrolls (not when just passing through).
    l.drag.timer = setInterval(() => {
      const d = l.drag;
      if (!d) return;
      const inGrid = d.y >= l.gridY && d.y <= l.gridY + gridH;
      const dir = inGrid && d.y < l.gridY + EDGE ? -1 : inGrid && d.y > l.gridY + gridH - EDGE ? 1 : 0;
      if (!dir) d.edgeSince = 0;
      else if (!d.edgeSince) d.edgeSince = Date.now();
      else if (Date.now() - d.edgeSince > 250) {
        const next = Math.max(0, Math.min(DAY_MIN * PX - gridH, l.scrollY + dir * 6));
        if (next !== l.scrollY) {
          l.scrollY = next;
          scroller.current?.scrollTo({ y: next, animated: false });
          refresh();
        }
      }
    }, 16);
    setDrag({ item, drop });
    onDragChange?.(true);
  }

  function move(dy: number) {
    const d = live.current.drag;
    if (!d) return;
    d.y = d.startY + dy;
    refresh();
  }

  function end(commit: boolean) {
    const l = live.current;
    const d = l.drag;
    if (!d) return;
    if (d.timer) clearInterval(d.timer);
    l.drag = null;
    l.justDragged = true;
    setTimeout(() => {
      l.justDragged = false;
    }, 250);
    setDrag(null);
    onDragChange?.(false);
    if (commit && d.drop) apply(d.item, d.drop.min);
  }

  /** Writes the move — what the website's drag writes for a drop on the same day. */
  function apply(item: DragItem, min: number | null) {
    const time = min === null ? null : timeString(min);
    if (item.kind === 'task') {
      const task = log.data.days[date]?.tasks?.find((t) => t.id === item.taskId);
      if (task && (task.time ?? null) !== time) log.moveDayTask(date, date, { ...task, time });
      return;
    }
    const found = routinesOn(log.data, date).find((i) => i.routine.id === item.routineId);
    if (!found) return;
    const { routine, occurrence } = found;
    const span = routineSpan(routine, occurrence);
    if ((span ? timeString(span.start) : null) === time) return;
    // The routine's own time needs no override for the day.
    log.updateOccurrence(date, routine.id, (o) => {
      const n = { ...o };
      if (time === routine.startTime) delete n.startTime;
      else n.startTime = time;
      return n;
    });
  }

  /** Taps right after a drag (the finger lifting) don't open anything. */
  const openTarget = (target: CalendarTarget) => {
    if (live.current.drag || live.current.justDragged) return;
    setOpen(target);
  };

  // ------------------------------------------------------------ layout

  /** Opens scrolled to now (today), or to the first thing at a time, or the morning. */
  function scrollToStart() {
    const l = live.current;
    if (l.scrolledFor === date) return;
    l.scrolledFor = date;
    const first = day.blocks.length ? Math.min(...day.blocks.map((b) => b.start)) : null;
    const t = new Date();
    const target = date === today ? t.getHours() * 60 + t.getMinutes() - 60 : first !== null ? first - 15 : 8 * 60;
    const y = Math.max(0, Math.min(DAY_MIN * PX - gridH, target * PX));
    l.scrollY = y;
    scroller.current?.scrollTo({ y, animated: false });
  }

  const overAny = drag?.drop?.min === null;
  const dropMin = drag?.drop && drag.drop.min !== null ? drag.drop.min : null;
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const draggableUntimed = day.untimed.some((it) => routineDrag(it, date)) || day.untimedTasks.length > 0;

  return (
    <View className="overflow-hidden rounded-xl" style={{ backgroundColor: colors.surface }}>
      {/* Any time: routines and tasks without a time. */}
      <View
        onLayout={(e) => {
          live.current.anyY = e.nativeEvent.layout.y;
        }}
        className="flex-row"
        style={{ borderBottomWidth: 1, borderColor: derived.hairline, backgroundColor: overAny ? withAlpha(colors.accent, 0.12) : 'transparent' }}
      >
        <View style={{ width: LABEL_W }} className="items-end justify-center pr-1.5">
          <Text className="font-ui-semibold text-right text-[11px] font-semibold" style={{ color: colors.muted }}>
            Any time
          </Text>
        </View>
        <View className="min-h-[60px] flex-1 flex-row flex-wrap items-center gap-1.5 p-2" style={{ borderLeftWidth: 1, borderColor: derived.hairline }}>
          {day.untimed.map((it) => {
            const item = routineDrag(it, date);
            return (
              <Draggable
                key={it.routine.id}
                enabled={!!item}
                onBegin={(y) => item && begin(item, live.current.anyY + (live.current.pills[it.routine.id] ?? 0) + y, 0)}
                onMove={move}
                onEnd={end}
              >
                <RoutinePill
                  item={it}
                  dragging={!!item && isSameDragItem(drag?.item, item)}
                  draggable={!!item}
                  onLayoutY={(y) => {
                    live.current.pills[it.routine.id] = y;
                  }}
                  onPress={() => openTarget({ kind: 'routine', date, routineId: it.routine.id })}
                />
              </Draggable>
            );
          })}
          {day.untimedTasks.map((t) => {
            const item = taskDrag(t, date);
            return (
              <Draggable key={t.id} enabled onBegin={(y) => begin(item, live.current.anyY + (live.current.pills[t.id] ?? 0) + y, 0)} onMove={move} onEnd={end}>
                <TaskPill
                  task={t}
                  dragging={isSameDragItem(drag?.item, item)}
                  onLayoutY={(y) => {
                    live.current.pills[t.id] = y;
                  }}
                  onPress={() => openTarget({ kind: 'tasks', date, ids: [t.id] })}
                />
              </Draggable>
            );
          })}
          {day.untimed.length === 0 && day.untimedTasks.length === 0 ? (
            <Text className="font-ui px-1 text-xs" style={{ color: overAny ? colors.accent : colors.muted }}>
              {overAny ? 'Drop to do it any time' : 'Nothing without a time'}
            </Text>
          ) : null}
        </View>
        {overAny ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: colors.accent }} /> : null}
      </View>

      {/* Its own line above the hours (kept while dragging, so the grid doesn't jump). */}
      {day.blocks.length === 0 ? (
        <Text className="font-ui px-3 py-1.5 text-center text-xs" style={{ color: colors.muted, borderBottomWidth: 1, borderColor: derived.hairline }}>
          {draggableUntimed ? 'Nothing planned at a set time. Hold one above and drag it onto a time.' : 'Nothing planned at a set time.'}
        </Text>
      ) : null}

      <ScrollView
        key={date}
        ref={scroller}
        style={{ height: gridH }}
        nestedScrollEnabled
        scrollEnabled={!drag}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(e) => {
          live.current.scrollY = e.nativeEvent.contentOffset.y;
        }}
        onLayout={(e) => {
          live.current.gridY = e.nativeEvent.layout.y;
          scrollToStart();
        }}
      >
        <View className="flex-row" style={{ height: DAY_MIN * PX }}>
          <View style={{ width: LABEL_W }}>
            {hours.map((h) =>
              h === 0 ? null : (
                <Text
                  key={h}
                  className="font-ui text-[10px]"
                  style={{ position: 'absolute', right: 6, top: h * HOUR - 7, color: colors.muted, fontVariant: ['tabular-nums'] }}
                >
                  {formatTime(h * 60).replace(/:00(?= )/, '')}
                </Text>
              ),
            )}
          </View>
          <View
            className="flex-1"
            style={{ borderLeftWidth: 1, borderColor: derived.hairline }}
            onLayout={(e: LayoutChangeEvent) => setColW(e.nativeEvent.layout.width)}
          >
            {/* Hour lines, and fainter half hours. */}
            {hours.flatMap((h) => [
              <View key={`h${h}`} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR, height: 1, backgroundColor: withAlpha(colors.foreground, 0.07) }} />,
              <View key={`m${h}`} pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR + HOUR / 2, height: 1, backgroundColor: withAlpha(colors.foreground, 0.035) }} />,
            ])}
            {colW > 0
              ? blocks.map((b) => (
                  <Draggable
                    key={b.id}
                    enabled={!!b.drag}
                    onBegin={(y) => b.drag && begin(b.drag, live.current.gridY + b.start * PX - live.current.scrollY + y, y / PX)}
                    onMove={move}
                    onEnd={end}
                  >
                    <GridBlock block={b} colW={colW} dragging={!!b.drag && isSameDragItem(drag?.item, b.drag)} onPress={() => openTarget(b.target)} />
                  </Draggable>
                ))
              : null}
            {drag && dropMin !== null ? <DropPreview item={drag.item} min={dropMin} /> : null}
            {date === today ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: nowMin * PX - 1, height: 2, backgroundColor: colors.danger, zIndex: 10 }}>
                <View style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
              </View>
            ) : null}
          </View>
        </View>
      </ScrollView>

      <DayItemSheet target={open} log={log} onClose={() => setOpen(null)} today={today} />
    </View>
  );
}

/** Press and hold, then drag: a long press lifts it (moving first scrolls instead). */
function Draggable({
  enabled,
  onBegin,
  onMove,
  onEnd,
  children,
}: {
  enabled: boolean;
  onBegin: (y: number) => void;
  onMove: (dy: number) => void;
  onEnd: (commit: boolean) => void;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  const pan = Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(HOLD_MS)
    .onStart((e) => onBegin(e.y))
    .onUpdate((e) => onMove(e.translationY))
    .onEnd((_e, success) => onEnd(success));
  return <GestureDetector gesture={pan}>{children}</GestureDetector>;
}

/** A timed routine (or task) on the grid, in its lane: the rounded bar down the left like the
    routine cards, its icon and name, the time, how much is done, and a thin progress line. */
function GridBlock({ block: b, colW, dragging, onPress }: { block: Block; colW: number; dragging: boolean; onPress: () => void }) {
  const { colors } = useAppTheme();
  const top = b.start * PX;
  const height = Math.max(MIN_BLOCK, (b.end - b.start) * PX - 2);
  const complete = b.total > 0 && b.done === b.total;
  const tall = height > 34;
  const progress = b.total > 1 && !complete ? ` · ${b.done}/${b.total}` : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${b.title}, ${formatTime(b.start)} to ${formatTime(b.end)}${b.total ? `, ${b.done} of ${b.total} done` : ''}${b.skipped ? ', skipped' : ''}`}
      accessibilityHint={b.drag ? 'Press and hold to drag it to another time' : undefined}
      hitSlop={height < 44 ? { top: (44 - height) / 2, bottom: (44 - height) / 2 } : undefined}
      android_ripple={{ color: withAlpha(b.color, 0.35) }}
      style={{
        position: 'absolute',
        top,
        height,
        left: (b.lane / b.lanes) * colW + 2,
        width: colW / b.lanes - 4,
        borderRadius: 8,
        overflow: 'hidden',
        paddingLeft: 16,
        paddingRight: 8,
        paddingVertical: tall ? 4 : 2,
        justifyContent: tall ? 'flex-start' : 'center',
        backgroundColor: withAlpha(b.color, complete ? 0.45 : 0.22),
        opacity: dragging ? 0.4 : b.skipped ? 0.45 : 1,
        zIndex: 1,
      }}
    >
      <View style={{ position: 'absolute', left: 6, top: tall ? 6 : 4, bottom: tall ? 6 : 4, width: 4, borderRadius: 2, backgroundColor: b.color }} />
      <View className="flex-row items-center gap-1">
        {b.icon !== undefined ? <RoutineIcon icon={b.icon} color={b.colorIdx ?? 0} size={16} /> : null}
        {complete ? <CheckIcon color={colors.foreground} size={13} /> : null}
        <Text
          numberOfLines={1}
          className="font-ui-semibold text-xs font-semibold"
          style={{ color: colors.foreground, flexShrink: 1, textDecorationLine: b.skipped ? 'line-through' : 'none' }}
        >
          {b.title}
        </Text>
        {!tall ? (
          <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted, flexShrink: 0, fontVariant: ['tabular-nums'] }}>
            {formatTime(b.start)}
            {progress}
          </Text>
        ) : null}
      </View>
      {tall ? (
        <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>
          {formatTime(b.start)} – {formatTime(b.end)}
          {progress}
        </Text>
      ) : null}
      {height > 52 && b.tasks.length > 0 ? (
        <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.foreground }}>
          {b.tasks.join(' · ')}
        </Text>
      ) : null}
      {b.total > 1 && b.done > 0 ? (
        <View style={{ position: 'absolute', left: 0, bottom: 0, height: 2, width: `${(b.done / b.total) * 100}%`, backgroundColor: b.color }} />
      ) : null}
    </Pressable>
  );
}

/** Where a drag would land, dashed, with the time. */
function DropPreview({ item, min }: { item: DragItem; min: number }) {
  const { colors } = useAppTheme();
  const height = Math.max(24, item.minutes * PX - 2);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: min * PX,
        height,
        left: 2,
        right: 2,
        zIndex: 5,
        borderRadius: 8,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: item.color,
        backgroundColor: withAlpha(item.color, 0.3),
        paddingHorizontal: 8,
        paddingVertical: 2,
        justifyContent: height >= 40 ? 'flex-start' : 'center',
      }}
    >
      {height >= 40 ? (
        <>
          <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
            {item.title}
          </Text>
          <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
            {formatTime(min)} – {formatTime(Math.min(DAY_MIN, min + item.minutes))}
          </Text>
        </>
      ) : (
        <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
          {formatTime(min)} · {item.title}
        </Text>
      )}
    </View>
  );
}

/** A routine without a time, in the Any time row: its icon, name, length and how much is done. */
function RoutinePill({
  item,
  dragging,
  draggable,
  onLayoutY,
  onPress,
}: {
  item: DayRoutine;
  dragging: boolean;
  draggable: boolean;
  onLayoutY: (y: number) => void;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const { routine, occurrence } = item;
  const color = routineColor(routine.color);
  const { done, total } = progressOf(routine, occurrence);
  const skipped = !!occurrence.skipped;
  const length = tasksOf(routine, occurrence).reduce((s, t) => s + t.minutes, 0);
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={`${routine.name || 'Untitled routine'}, any time, ${done} of ${total} done${skipped ? ', skipped' : ''}`}
      accessibilityHint={draggable ? 'Press and hold to drag it onto a time' : undefined}
      android_ripple={{ color: withAlpha(color, 0.35) }}
      className="min-h-11 max-w-full flex-row items-center gap-1.5 overflow-hidden rounded-lg py-1.5 pl-1.5 pr-2"
      style={{ backgroundColor: withAlpha(color, total > 0 && done === total ? 0.3 : 0.15), opacity: dragging ? 0.4 : skipped ? 0.5 : 1 }}
    >
      <RoutineIcon icon={routine.icon} color={routine.color} size={26} />
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground, textDecorationLine: skipped ? 'line-through' : 'none' }}>
          {routine.name || 'Untitled routine'}
        </Text>
        {length > 0 ? (
          <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted }}>
            {formatMinutesShort(length)}
          </Text>
        ) : null}
      </View>
      <ProgressMark done={done} total={total} color={color} />
    </Pressable>
  );
}

/** One of the day's own tasks without a time, in the Any time row. */
function TaskPill({ task, dragging, onLayoutY, onPress }: { task: DayTask; dragging: boolean; onLayoutY: (y: number) => void; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={`${task.title || 'Task'}, any time, ${task.done ? 'done' : 'not done'}`}
      accessibilityHint="Press and hold to drag it onto a time"
      android_ripple={{ color: withAlpha(TASK_COLOR, 0.35) }}
      className="min-h-11 max-w-full flex-row items-center gap-1.5 overflow-hidden rounded-lg py-1.5 pl-1.5 pr-2"
      style={{ backgroundColor: withAlpha(TASK_COLOR, task.done ? 0.3 : 0.15), opacity: dragging ? 0.4 : 1 }}
    >
      {/* A task's mark (not a tick: that read as already done next to its progress ring). */}
      <View className="h-[26px] w-[26px] items-center justify-center rounded-full" style={{ backgroundColor: withAlpha(TASK_COLOR, 0.25) }}>
        <ChecklistIcon color={colors.foreground} size={15} />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} className="font-ui-semibold text-xs font-semibold" style={{ color: colors.foreground }}>
          {task.title || 'Task'}
        </Text>
        {task.minutes > 0 ? (
          <Text numberOfLines={1} className="font-ui text-[11px]" style={{ color: colors.muted }}>
            {formatMinutesShort(task.minutes)}
          </Text>
        ) : null}
      </View>
      <ProgressMark done={task.done ? 1 : 0} total={1} color={TASK_COLOR} />
    </Pressable>
  );
}

/** A small ring filling up as tasks are done, a check when all are (the website's `ProgressMark`). */
function ProgressMark({ done, total, color }: { done: number; total: number; color: string }) {
  const { colors } = useAppTheme();
  if (total > 0 && done === total)
    return (
      <View className="h-5 w-5 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
        <CheckIcon color={colors.surface} size={13} />
      </View>
    );
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" style={{ transform: [{ rotate: '-90deg' }] }}>
      <Circle cx={10} cy={10} r={r} fill="none" stroke={withAlpha(colors.foreground, 0.15)} strokeWidth={2.5} />
      {done > 0 && total > 0 ? (
        <Circle cx={10} cy={10} r={r} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeDasharray={`${(done / total) * c} ${c}`} />
      ) : null}
    </Svg>
  );
}

/** What tapping something opens: the routine's card (the Today tab's) or the day's tasks, in a sheet. */
function DayItemSheet({ target, log, today, onClose }: { target: CalendarTarget | null; log: PracticeLog; today: string; onClose: () => void }) {
  const date = target?.date ?? today;
  const item = target?.kind === 'routine' ? routinesOn(log.data, date).find((i) => i.routine.id === target.routineId) : undefined;
  // Hidden while another screen is on top (the card's Open / Edit routine), and back on return.
  const focused = useIsFocused();
  const visible = focused && !!target && (target.kind === 'tasks' || !!item);
  const title = date === today ? 'Today' : `${WEEKDAY_SHORT[weekdayOf(date)]}, ${formatShortDate(date)}`;
  return (
    <ToolSheet visible={visible} onClose={onClose} title={title}>
      {/* The sheet is the card's own fill, so the card's padding lines up with the sheet's edge. */}
      <View style={{ marginHorizontal: -16 }}>
        {item ? <RoutineCard date={date} item={item} log={log} /> : target?.kind === 'tasks' ? <DayTasks date={date} log={log} /> : null}
      </View>
    </ToolSheet>
  );
}
