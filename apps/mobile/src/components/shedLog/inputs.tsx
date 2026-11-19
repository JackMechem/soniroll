import {
  MONTH_NAMES,
  WEEKDAY_LETTER,
  addDays,
  addMonths,
  formatLongDate,
  formatMinutesShort,
  formatTime,
  fromDateKey,
  monthGrid,
  parseTime,
  timeString,
} from '@jam-practice/core/practiceLog';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { ChoicePill } from '@/components/shedLog/parts';
import { useAppTheme, withAlpha } from '@/theme/ThemeProvider';

/**
 * Inputs the Shed Log's sheets use on the phone (the website uses the browser's own date and time
 * fields): minutes with − / +, a time of day with − / + and quick picks, and a date with ‹ › and a
 * small month to pick from.
 */

function Step({ label, onPress, children }: { label: string; onPress: () => void; children: string }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-11 w-11 items-center justify-center overflow-hidden rounded-lg"
      style={{ backgroundColor: derived.fill }}
    >
      <Text className="font-ui-semibold text-xl font-semibold" style={{ color: colors.foreground }}>
        {children}
      </Text>
    </Pressable>
  );
}

function Value({ children, sub }: { children: string; sub?: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="min-w-[110px] flex-1 items-center">
      <Text className="font-ui-bold text-xl font-bold" style={{ color: colors.foreground, fontVariant: ['tabular-nums'] }}>
        {children}
      </Text>
      {sub ? (
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** Minutes, stepped by `step` (decimal minutes are kept as they are). */
export function MinutesInput({ value, onChange, min = 0, max = 600, step = 5 }: { value: number; onChange: (m: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <View className="flex-row items-center gap-2">
      <Step label={`${step} minutes less`} onPress={() => onChange(Math.max(min, Math.ceil(value / step) * step - step))}>
        −
      </Step>
      <Value>{value > 0 ? formatMinutesShort(value) : '0 min'}</Value>
      <Step label={`${step} minutes more`} onPress={() => onChange(Math.min(max, Math.floor(value / step) * step + step))}>
        +
      </Step>
    </View>
  );
}

const QUICK_TIMES = ['08:00', '12:00', '17:00', '19:00'];

/** A time of day ("HH:MM"): − / + by 15 minutes, ‹hour› buttons, and quick picks. `null` = any
    time (with `allowNone`). */
export function TimeInput({ value, onChange, allowNone, noneLabel = 'Any time' }: { value: string | null; onChange: (t: string | null) => void; allowNone?: boolean; noneLabel?: string }) {
  const mins = parseTime(value);
  const set = (m: number) => onChange(timeString(((m % 1440) + 1440) % 1440));
  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {allowNone ? <ChoicePill label={noneLabel} on={mins === null} onPress={() => onChange(null)} /> : null}
        {QUICK_TIMES.map((t) => (
          <ChoicePill key={t} label={formatTime(parseTime(t)!)} on={value === t} onPress={() => onChange(t)} />
        ))}
      </View>
      {mins !== null ? (
        <View className="flex-row items-center gap-2">
          <Step label="An hour earlier" onPress={() => set(mins - 60)}>
            «
          </Step>
          <Step label="15 minutes earlier" onPress={() => set(Math.ceil(mins / 15) * 15 - 15)}>
            −
          </Step>
          <Value>{formatTime(mins)}</Value>
          <Step label="15 minutes later" onPress={() => set(Math.floor(mins / 15) * 15 + 15)}>
            +
          </Step>
          <Step label="An hour later" onPress={() => set(mins + 60)}>
            »
          </Step>
        </View>
      ) : null}
    </View>
  );
}

/** A day ("YYYY-MM-DD"): ‹ › a day at a time, and tapping it opens a month to pick from. */
export function DateInput({ value, onChange, min }: { value: string; onChange: (d: string) => void; min?: string }) {
  const { colors, derived } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const d = fromDateKey(month);
  const days = monthGrid(d.getFullYear(), d.getMonth());
  const ok = (k: string) => !min || k >= min;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-2">
        <Step label="The day before" onPress={() => ok(addDays(value, -1)) && onChange(addDays(value, -1))}>
          ‹
        </Step>
        <Pressable
          onPress={() => {
            setMonth(value);
            setOpen((o) => !o);
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick a day"
          android_ripple={{ color: colors['surface-hover'] }}
          className="h-11 flex-1 items-center justify-center overflow-hidden rounded-lg px-2"
          style={{ backgroundColor: derived.fill }}
        >
          <Text numberOfLines={1} className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            {formatLongDate(value)}
          </Text>
        </Pressable>
        <Step label="The day after" onPress={() => onChange(addDays(value, 1))}>
          ›
        </Step>
      </View>
      {open ? (
        <View className="gap-1 rounded-xl p-2" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center">
            <Pressable onPress={() => setMonth(addMonths(month, -1))} accessibilityLabel="Previous month" hitSlop={8} className="h-9 w-9 items-center justify-center">
              <ChevronLeftIcon color={colors.muted} size={20} />
            </Pressable>
            <Text className="font-ui-semibold flex-1 text-center text-sm font-semibold" style={{ color: colors.foreground }}>
              {MONTH_NAMES[d.getMonth()]} {d.getFullYear()}
            </Text>
            <Pressable onPress={() => setMonth(addMonths(month, 1))} accessibilityLabel="Next month" hitSlop={8} className="h-9 w-9 items-center justify-center">
              <ChevronRightIcon color={colors.muted} size={20} />
            </Pressable>
          </View>
          <View className="flex-row">
            {WEEKDAY_LETTER.map((l, i) => (
              <Text key={i} className="font-ui flex-1 text-center text-xs" style={{ color: colors.muted }}>
                {l}
              </Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {days.map((k) => {
              const inMonth = fromDateKey(k).getMonth() === d.getMonth();
              const on = k === value;
              return (
                <Pressable
                  key={k}
                  disabled={!ok(k)}
                  onPress={() => {
                    onChange(k);
                    setOpen(false);
                  }}
                  accessibilityLabel={formatLongDate(k)}
                  style={{ width: `${100 / 7}%`, height: 38, alignItems: 'center', justifyContent: 'center', opacity: ok(k) ? 1 : 0.3 }}
                >
                  <View className="h-8 w-8 items-center justify-center rounded-full" style={{ backgroundColor: on ? colors.accent : 'transparent' }}>
                    <Text
                      className="font-ui text-sm"
                      style={{ color: on ? colors['accent-foreground'] : inMonth ? colors.foreground : withAlpha(colors.muted, 0.6), fontVariant: ['tabular-nums'] }}
                    >
                      {fromDateKey(k).getDate()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
