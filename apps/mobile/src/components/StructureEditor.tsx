import { defaultAccents, defaultSubAccents } from '@jam-practice/core/meterControls';
import { MAX_BEATS } from '@jam-practice/core/meters';
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
import { Pressable, Text, View } from 'react-native';

import { BeatIndicator } from '@/components/BeatIndicator';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, PlusIcon } from '@/components/icons';
import { StepperPill, SubdivisionPicker, TimeSignatureControl } from '@/components/tool/meter';
import { OptionGroup } from '@/components/tool/reward';
import { EmptyPanel } from '@/components/tool/rhythm';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

/**
 * "Changing meters" for the metronome-style tools (Metronome, Tempo Trainer, Recorder), in the
 * website's newer look (`apps/web/components/StructureEditor.tsx` with `modern`): the form (the
 * order sections play in, the playing one lit) with "add to form" buttons, then each named section
 * as a card that opens to its length, drawn time signature, subdivision and accents. It lives in a
 * chip's sheet, so its panels sit on the faint fill over the sheet.
 *
 * Form chips move with ‹ › buttons rather than the web's drag (a touch drag inside a scrolling
 * sheet is easy to get wrong).
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
  const { colors, derived } = useAppTheme();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bars = totalBars(structure);
  const parts = structure.form.length;

  return (
    <View className="gap-5">
      <OptionGroup
        title="Form"
        aside={
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {parts} part{parts === 1 ? '' : 's'} · {bars} bar{bars === 1 ? '' : 's'}
          </Text>
        }
      >
        <View className="min-h-12 flex-row flex-wrap items-center gap-1.5 rounded-lg p-2" style={{ backgroundColor: colors.background }}>
          {parts === 0 ? (
            <Text className="font-ui px-2 py-1.5 text-sm" style={{ color: colors.muted }}>
              {structure.sections.length === 0
                ? 'Add a section below, then add it to the form.'
                : 'Add sections to the form to set the order they play in.'}
            </Text>
          ) : (
            structure.form.map((sectionId, index) => {
              const section = sectionById(structure, sectionId);
              if (!section) return null;
              const active = activeFormIndex !== null && activeFormIndex % parts === index;
              const fg = active ? colors['accent-foreground'] : colors.foreground;
              const icon = active ? colors['accent-foreground'] : colors.muted;
              return (
                <View
                  key={`${sectionId}-${index}`}
                  className="h-9 flex-row items-center rounded-md pl-3"
                  style={{ backgroundColor: active ? colors.accent : colors.surface }}
                >
                  <Text numberOfLines={1} className="font-ui-semibold mr-0.5 text-sm font-semibold" style={{ color: fg }}>
                    {section.name || 'Untitled'}
                  </Text>
                  <FormChipButton label={`Move ${section.name} earlier`} disabled={index === 0} onPress={() => onChange(reorderForm(structure, index, index - 1))}>
                    <ChevronLeftIcon color={icon} size={16} />
                  </FormChipButton>
                  <FormChipButton
                    label={`Move ${section.name} later`}
                    disabled={index === parts - 1}
                    onPress={() => onChange(reorderForm(structure, index, index + 1))}
                  >
                    <ChevronRightIcon color={icon} size={16} />
                  </FormChipButton>
                  <FormChipButton label={`Remove ${section.name} from the form`} onPress={() => onChange(removeFormEntry(structure, index))}>
                    <CloseIcon color={icon} size={14} />
                  </FormChipButton>
                </View>
              );
            })
          )}
        </View>
        {structure.sections.length > 0 ? (
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-ui text-xs" style={{ color: colors.muted }}>
              Add to form:
            </Text>
            {structure.sections.map((section) => (
              <Pressable
                key={section.id}
                onPress={() => onChange(appendToForm(structure, section.id))}
                accessibilityLabel={`Add ${section.name} to the form`}
                android_ripple={{ color: colors['surface-hover'] }}
                className="h-8 flex-row items-center gap-1 overflow-hidden rounded-md px-2.5"
                style={{ backgroundColor: derived.fill }}
              >
                <PlusIcon color={colors.muted} size={14} />
                <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                  {section.name || 'Untitled'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </OptionGroup>

      <OptionGroup title="Sections">
        {structure.sections.map((section) => (
          <SectionCard
            key={section.id}
            section={section}
            expanded={expandedId === section.id}
            onToggleExpanded={() => setExpandedId(expandedId === section.id ? null : section.id)}
            onChange={(patch) => onChange(updateSection(structure, section.id, patch))}
            onCycleAccent={(beatIndex) => onChange(cycleSectionAccent(structure, section.id, beatIndex))}
            onCycleSubAccent={(beatIndex, subIndex) => onChange(cycleSectionSubAccent(structure, section.id, beatIndex, subIndex))}
            onRemove={() => {
              onChange(removeSection(structure, section.id));
              if (expandedId === section.id) setExpandedId(null);
            }}
          />
        ))}
        <Pressable
          onPress={() => onChange(addSection(structure))}
          accessibilityRole="button"
          android_ripple={{ color: colors['surface-hover'] }}
          className="h-11 flex-row items-center justify-center gap-1.5 overflow-hidden rounded-lg"
          style={{ backgroundColor: derived.fill }}
        >
          <PlusIcon color={colors.muted} size={18} />
          <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            New section
          </Text>
        </Pressable>
      </OptionGroup>
    </View>
  );
}

/** Stands in for the beat strip in "Changing meters" while there's nothing to play yet, saying
    what to do next (Start stays off until then). */
export function StructureEmptyHint({ structure }: { structure: Structure }) {
  return (
    <EmptyPanel>
      {structure.sections.length === 0
        ? 'Add sections under Sections below, then put them in the form to start.'
        : 'Put your sections in the form (under Sections below) to start.'}
    </EmptyPanel>
  );
}

function FormChipButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={2}
      className="h-9 w-7 items-center justify-center"
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      {children}
    </Pressable>
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
  const { colors, derived } = useAppTheme();
  const accents = defaultAccents(section.beatsPerBar, section.accents);
  const subAccents = defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents);

  return (
    <View className="overflow-hidden rounded-lg" style={{ backgroundColor: derived.fill }}>
      <Pressable
        onPress={onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-3 px-3 py-2.5"
      >
        <View className="min-w-0 flex-1">
          <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
            {section.name || 'Untitled'}
          </Text>
          <Text className="font-ui text-xs" style={{ color: colors.muted }}>
            {section.bars} bar{section.bars === 1 ? '' : 's'} of {section.beatsPerBar}/{section.beatUnit}
          </Text>
        </View>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <ChevronDownIcon color={colors.muted} size={18} />
        </View>
      </Pressable>

      {expanded ? (
        <View className="gap-5 px-3 pb-4 pt-1">
          <TextInput
            value={section.name}
            onChangeText={(name) => onChange({ name })}
            placeholder="Section name"
            placeholderTextColor={colors.muted}
            accessibilityLabel="Section name"
            className="font-ui h-11 rounded-lg px-3 text-sm"
            style={{ backgroundColor: colors.background, color: colors.foreground }}
          />
          <OptionGroup title="Length">
            <StepperPill label="Bars" unit={['bar', 'bars']} value={section.bars} min={1} max={MAX_BEATS} onChange={(bars) => onChange({ bars })} />
          </OptionGroup>
          <OptionGroup title="Time signature">
            <TimeSignatureControl
              beatsPerBar={section.beatsPerBar}
              beatUnit={section.beatUnit}
              onChangeBeats={(n) => {
                const beats = Math.min(MAX_BEATS, Math.max(1, n));
                onChange({ beatsPerBar: beats, accents: defaultAccents(beats, accents) });
              }}
              onSetBeatUnit={(beatUnit) => onChange({ beatUnit })}
            />
          </OptionGroup>
          <OptionGroup title="Subdivision">
            <SubdivisionPicker value={section.subdivision} onChange={(subdivision) => onChange({ subdivision })} />
          </OptionGroup>
          <OptionGroup title="Accents">
            <View className="items-center rounded-lg py-3" style={{ backgroundColor: colors.background }}>
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
          </OptionGroup>
          <Pressable onPress={onRemove} accessibilityRole="button" hitSlop={8} className="self-start">
            <Text className="font-ui-semibold text-sm font-semibold" style={{ color: colors.danger }}>
              Remove section
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
