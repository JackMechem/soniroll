import { topicForHref, type HelpTopic } from '@jam-practice/core/helpContent';
import { NAV_LINKS_DATA } from '@jam-practice/core/navLinks';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { INTRO_NOTES, INTRO_OMIT } from '@/components/tool/introNotes';
import { ToolSheet } from '@/components/tool/SettingChip';
import { HelpIcon } from '@/components/tool/toolIcons';
import { Button, IconButton, ToolIcon } from '@/components/ui';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * "What is this tool?" — the **?** at the right of a tool's header. It opens a sheet with the
 * tool's intro from the website's Help (`packages/core/helpContent.ts`): what it's for, how to use
 * it in a few steps, and each of its options explained. Only when tapped (the website stopped
 * opening intros by itself because Jack found it annoying, FB-23).
 *
 * `_layout.tsx` puts it in the header of the routes listed here; a screen that sets its own
 * `headerRight` (Score Writer, Shed Notes) includes `<ToolHelpButton>` in it.
 */

/** The tool screens that get a ?, by route name, and the page their help topic is about. */
const INTRO_ROUTES: Record<string, string> = {
  'tool/metronome': '/metronome',
  'tool/random-metric-modulation': '/random-metric-modulation',
  'tool/tempo-trainer': '/tempo-trainer',
  'tool/tuner': '/tuner',
  'tool/slow-downer': '/slow-downer',
  'tool/recorder': '/recorder',
  'tool/random-sticking-warmup': '/random-sticking-warmup',
  'tool/syncopation': '/syncopation',
  'tool/time-test': '/time-test',
  'tool/jam-practice': '/jam-practice',
  'tool/rhythm-section': '/rhythm-section',
  'tool/note-trainer': '/note-trainer',
  'tool/scale-trainer': '/scale-trainer',
  'tool/interval-trainer': '/interval-trainer',
  'tool/guess-the-interval': '/guess-the-interval',
  'tool/guess-the-chord': '/guess-the-chord',
  'tool/guess-the-progression': '/guess-the-progression',
  'tool/find-the-root': '/find-the-root',
  'tool/practice-timer': '/practice-timer',
  'tool/score-writer': '/score-writer',
  'tool/shed-notes': '/shed-notes',
  'tool/lessons': '/lessons',
  'tool/lessons-student': '/lessons',
  'tool/lessons-teacher': '/lessons',
};

/** The help page for a route, if that route's header gets a ?. */
export function toolIntroHref(routeName: string): string | undefined {
  const href = INTRO_ROUTES[routeName];
  return href && topicForHref(href) ? href : undefined;
}

/** The header's ? for a tool, with its intro sheet. It never opens by itself: Jack found that
    annoying on the website (FB-23), so it's there when you want it. */
export function ToolHelpButton({ href }: { href: string }) {
  const topic = topicForHref(href);
  const [open, setOpen] = useState(false);

  if (!topic) return null;
  return (
    <>
      <IconButton Icon={HelpIcon} label={`How ${topic.title} works`} onPress={() => setOpen(true)} />
      <ToolSheet visible={open} onClose={() => setOpen(false)} title={`How ${topic.title} works`}>
        <ToolIntroBody topic={topic} href={href} onDone={() => setOpen(false)} />
      </ToolSheet>
    </>
  );
}

function ToolIntroBody({ topic, href, onDone }: { topic: HelpTopic; href: string; onDone: () => void }) {
  const { colors, derived } = useAppTheme();
  const tool = NAV_LINKS_DATA.find((l) => l.href === href);
  const notes = INTRO_NOTES[href] ?? [];
  // Leave out what the phone doesn't have (Record on the Tuner, Export as PDF in Shed Notes…).
  const omit = INTRO_OMIT[href];
  const steps = topic.steps.filter((step) => !omit?.steps?.includes(step.title));
  const options = topic.options?.filter((option) => !omit?.options?.includes(option.name));
  return (
    <>
      <View className="flex-row items-start gap-3">
        {tool ? <ToolIcon tool={tool} size={40} /> : null}
        <View className="flex-1 gap-1">
          <Text className="font-ui-semibold text-base font-semibold leading-6" style={{ color: colors.foreground }}>
            {topic.tagline}
          </Text>
          <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
            {topic.purpose}
          </Text>
        </View>
      </View>

      <View className="overflow-hidden rounded-lg" style={{ backgroundColor: colors.background }}>
        {steps.map((step, i) => (
          <View
            key={step.title}
            className="flex-row gap-3 px-3 py-2.5"
            style={i > 0 ? { borderTopWidth: 1, borderColor: derived.hairline } : undefined}
          >
            <Text className="font-ui w-4 pt-px text-right text-sm tabular-nums" style={{ color: colors.muted }}>
              {i + 1}
            </Text>
            <View className="flex-1">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {step.title}
              </Text>
              <Text className="font-ui text-xs leading-4" style={{ color: colors.muted }}>
                {step.text}
              </Text>
            </View>
          </View>
        ))}
      </View>

      {options?.length ? (
        <View className="gap-2.5">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            Its options
          </Text>
          {options.map((option) => (
            <View key={option.name} className="gap-0.5">
              <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {option.name}
              </Text>
              <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
                {option.text}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {notes.length ? (
        <View className="gap-2">
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.muted }}>
            On the phone
          </Text>
          {notes.map((line) => (
            <Text key={line} className="font-ui text-sm leading-5" style={{ color: colors.foreground }}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <Button label="Got it" onPress={onDone} style={{ alignSelf: 'flex-end' }} />
    </>
  );
}
