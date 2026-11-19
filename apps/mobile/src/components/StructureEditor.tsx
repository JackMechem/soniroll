import type { BeatLevel } from '@jam-practice/core/clickSounds';
import { defaultAccents, defaultSubAccents } from '@jam-practice/core/meterControls';
import {
  type Structure,
  type StructureSection,
  addSection,
  appendToForm,
  cycleSectionAccent,
  cycleSectionSubAccent,
  reorderForm,
  removeFormEntry,
  removeSection,
  sectionById,
  totalBars,
  updateSection,
} from '@jam-practice/core/structure';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { BeatIndicator } from '@/components/BeatIndicator';
import { MeterOptions } from '@/components/MetronomeControls';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Native port of `apps/web/components/StructureEditor.tsx`. One real, deliberate simplification:
 * the web version supports dragging a form chip to an arbitrary position (Pointer Events, works
 * on touch too); this version replaces that with plain ‹ › move buttons on each chip. Not a cut
 * corner so much as a risk call — a hand-rolled touch-drag gesture is exactly the kind of thing
 * that's easy to get subtly wrong (hit-testing, scroll-view conflicts, momentum) without a real
 * device to iterate against, and this sandbox's own device connection has been too unreliable this
 * session to trust a blind gesture implementation. ‹ › buttons do the same job with no such risk.
 */
export function StructureEditor({
  structure,
  onChange,
  activeFormIndex,
}: {
  structure: Structure;
  onChange: (structure: Structure) => void;
  /** The form index currently playing, or `null` when the metronome isn't running. */
  activeFormIndex: number | null;
}) {
  const { colors } = useAppTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
            Form
          </Text>
          <Text className="text-xs font-ui" style={{ color: colors.muted }}>
            {structure.form.length} part{structure.form.length === 1 ? '' : 's'} · {totalBars(structure)} bar
            {totalBars(structure) === 1 ? '' : 's'}
          </Text>
        </View>

        <View className="flex-row flex-wrap gap-2">
          {structure.form.map((sectionId, index) => {
            const section = sectionById(structure, sectionId);
            if (!section) return null;
            const active = activeFormIndex !== null && activeFormIndex % structure.form.length === index;
            return (
              <View
                key={`${sectionId}-${index}`}
                className="flex-row items-center gap-1 rounded-full py-1 pl-3 pr-1"
                style={{ backgroundColor: active ? colors.accent : colors.surface }}
              >
                <Text
                  className="text-xs font-bold font-ui-bold"
                  style={{ color: active ? colors['accent-foreground'] : colors.foreground }}
                >
                  {section.name}
                </Text>
                <Pressable
                  onPress={() => onChange(reorderForm(structure, index, index - 1))}
                  disabled={index === 0}
                  className="h-6 w-6 items-center justify-center rounded-full"
                  style={{ opacity: index === 0 ? 0.3 : 1 }}
                >
                  <Text className="font-ui" style={{ color: active ? colors['accent-foreground'] : colors.muted }}>‹</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChange(reorderForm(structure, index, index + 1))}
                  disabled={index === structure.form.length - 1}
                  className="h-6 w-6 items-center justify-center rounded-full"
                  style={{ opacity: index === structure.form.length - 1 ? 0.3 : 1 }}
                >
                  <Text className="font-ui" style={{ color: active ? colors['accent-foreground'] : colors.muted }}>›</Text>
                </Pressable>
                <Pressable
                  onPress={() => onChange(removeFormEntry(structure, index))}
                  className="h-6 w-6 items-center justify-center rounded-full"
                >
                  <Text className="font-ui" style={{ color: active ? colors['accent-foreground'] : colors.muted }}>×</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {structure.sections.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {structure.sections.map((section) => (
              <Pressable
                key={section.id}
                onPress={() => onChange(appendToForm(structure, section.id))}
                className="rounded-full border px-3 py-1.5"
                style={{ borderColor: colors['surface-hover'] }}
              >
                <Text className="text-xs font-bold font-ui-bold" style={{ color: colors.foreground }}>
                  + {section.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
          Sections
        </Text>
        {structure.sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            expanded={expandedId === section.id}
            onToggleExpanded={() => setExpandedId(expandedId === section.id ? null : section.id)}
            onChange={(patch) => onChange(updateSection(structure, section.id, patch))}
            onCycleAccent={(beatIndex) => onChange(cycleSectionAccent(structure, section.id, beatIndex))}
            onCycleSubAccent={(beatIndex, subIndex) =>
              onChange(cycleSectionSubAccent(structure, section.id, beatIndex, subIndex))
            }
            onRemove={() => onChange(removeSection(structure, section.id))}
          />
        ))}
        <Pressable
          onPress={() => onChange(addSection(structure))}
          className="items-center rounded-2xl border border-dashed p-3"
          style={{ borderColor: colors['surface-hover'] }}
        >
          <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.accent }}>
            + New section
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionCard({
  section,
  expanded,
  onToggleExpanded,
  onChange,
  onCycleAccent,
  onCycleSubAccent,
  onRemove,
}: {
  section: StructureSection;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (patch: Partial<StructureSection>) => void;
  onCycleAccent: (beatIndex: number) => void;
  onCycleSubAccent: (beatIndex: number, subIndex: number) => void;
  onRemove: () => void;
}) {
  const { colors } = useAppTheme();
  const accents = defaultAccents(section.beatsPerBar, section.accents);
  const subAccents = defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents);

  return (
    <View className="rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
      <Pressable onPress={onToggleExpanded} className="flex-row items-center justify-between">
        <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.foreground }}>
          {section.name} · {section.bars} bar{section.bars === 1 ? '' : 's'} · {section.beatsPerBar}/
          {section.beatUnit}
        </Text>
        <Text className="font-ui" style={{ color: colors.muted }}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>

      {expanded ? (
        <View className="mt-3 gap-3">
          <TextInput
            value={section.name}
            onChangeText={(name) => onChange({ name })}
            className="rounded-xl px-3 py-2 text-sm font-semibold font-ui-semibold"
            style={{ backgroundColor: colors.background, color: colors.foreground }}
          />

          <View className="flex-row items-center justify-center gap-3">
            <Text className="text-xs font-semibold font-ui-semibold" style={{ color: colors.muted }}>
              Bars
            </Text>
            <Pressable
              onPress={() => onChange({ bars: Math.max(1, section.bars - 1) })}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="font-ui" style={{ color: colors.foreground }}>−</Text>
            </Pressable>
            <Text className="min-w-[24px] text-center font-bold font-ui-bold" style={{ color: colors.foreground }}>
              {section.bars}
            </Text>
            <Pressable
              onPress={() => onChange({ bars: section.bars + 1 })}
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="font-ui" style={{ color: colors.foreground }}>+</Text>
            </Pressable>
          </View>

          <MeterOptions
            beatsPerBar={section.beatsPerBar}
            beatUnit={section.beatUnit}
            accents={accents}
            subdivision={section.subdivision}
            onChangeBeats={(n) => onChange({ beatsPerBar: n, accents: defaultAccents(n, accents) })}
            onSetBeatUnit={(beatUnit) => onChange({ beatUnit })}
            onSetSubdivision={(subdivision) => onChange({ subdivision })}
            onApplyGroups={(groups) =>
              onChange({
                beatsPerBar: groups.reduce((a, b) => a + b, 0),
                accents: groups.flatMap(
                  (size) => Array.from({ length: size }, (_, i) => (i === 0 ? 2 : 1)) as BeatLevel[],
                ),
              })
            }
          />

          <View className="items-center">
            <BeatIndicator
              size="sm"
              accents={accents}
              subdivision={section.subdivision}
              subAccents={subAccents}
              currentBeat={null}
              onCycle={onCycleAccent}
              onCycleSub={onCycleSubAccent}
            />
          </View>

          <Pressable onPress={onRemove} className="items-center rounded-xl p-2.5">
            <Text className="text-sm font-bold font-ui-bold" style={{ color: colors.danger }}>
              Remove section
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
