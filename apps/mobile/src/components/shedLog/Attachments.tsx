import { NAV_LINKS_DATA, currentToolHref, hrefToSlug } from '@jam-practice/core/navLinks';
import { attachmentKey, type Attachment } from '@jam-practice/core/practiceLog';
import { sortByText } from '@jam-practice/core/sortText';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChordChartIcon, CloseIcon, MusicNoteIcon, NAV_LINK_ICONS, PlusIcon, SetlistIcon, type IconProps } from '@/components/icons';
import { CheckBox, Muted, SmallButton } from '@/components/shedLog/parts';
import { Segmented } from '@/components/tool/reward';
import { ToolSheet } from '@/components/tool/SettingChip';
import { SearchField } from '@/components/ui';
import { prettyKeyName } from '@/lib/keyNames';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useSetlists } from '@/lib/useSetlists';
import { TUNE_LIST_LABEL, allTunes, useTuneLists } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * What's attached to a routine or task (the website's `components/practicelog/Attachments.tsx`):
 * tunes, setlists, chord charts and tools as chips that open what they point at; with `onChange`,
 * each has a × and there's an Attach button that opens the picker sheet. `fixed` go first, without
 * a × (a routine task's own attachments, before the ones for just that day).
 */

/** Tools you can attach (everything in the tool list but the library pages and Community). */
const TOOL_LINKS = NAV_LINKS_DATA.filter((l) => !['/community', '/tunes', '/chord-charts', '/shed-log'].includes(l.href));

function toolOf(href: string) {
  const current = currentToolHref(href);
  return NAV_LINKS_DATA.find((l) => l.href === current);
}

function iconOf(a: Attachment): ComponentType<IconProps> {
  if (a.kind === 'tool') return NAV_LINK_ICONS[currentToolHref(a.href)] ?? MusicNoteIcon;
  return a.kind === 'setlist' ? SetlistIcon : a.kind === 'chart' ? ChordChartIcon : MusicNoteIcon;
}

function labelOf(a: Attachment): string {
  return a.kind === 'tool' ? (toolOf(a.href)?.label ?? a.label) : a.label;
}

export function AttachmentChips({
  items,
  fixed = [],
  onChange,
  compact,
  addLabel = 'Attach',
}: {
  items: Attachment[];
  fixed?: Attachment[];
  onChange?: (items: Attachment[]) => void;
  compact?: boolean;
  addLabel?: string;
}) {
  const { colors, derived } = useAppTheme();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  if (!items.length && !fixed.length && !onChange) return null;

  function open(a: Attachment) {
    if (a.kind === 'tool') {
      const tool = toolOf(a.href);
      if (tool) router.push(`/tool/${hrefToSlug(tool.href)}`);
    } else if (a.kind === 'tune') router.push({ pathname: '/library/tune', params: { id: a.id, list: a.list } });
    else if (a.kind === 'setlist') router.push({ pathname: '/library/setlist', params: { id: a.id } });
    else router.push({ pathname: '/tool/chord-charts-view', params: { id: a.id } });
  }

  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {[...fixed.map((a) => ({ a, own: false })), ...items.map((a) => ({ a, own: true }))].map(({ a, own }) => {
        const Icon = iconOf(a);
        const label = labelOf(a);
        return (
          <View key={`${own ? 'own' : 'fixed'}:${attachmentKey(a)}`} className="flex-row items-center overflow-hidden rounded-md" style={{ backgroundColor: derived.fill, maxWidth: '100%' }}>
            <Pressable
              onPress={() => open(a)}
              accessibilityRole="link"
              accessibilityLabel={`Open ${label}`}
              android_ripple={{ color: colors['surface-hover'] }}
              className={`flex-row items-center gap-1.5 ${compact ? 'h-7 px-2' : 'h-9 px-2.5'}`}
              style={{ flexShrink: 1 }}
            >
              <Icon color={colors.muted} size={compact ? 13 : 15} />
              <Text numberOfLines={1} className={`font-ui-semibold font-semibold ${compact ? 'text-xs' : 'text-sm'}`} style={{ color: colors.foreground, flexShrink: 1 }}>
                {label}
              </Text>
            </Pressable>
            {onChange && own ? (
              <Pressable
                onPress={() => onChange(items.filter((x) => attachmentKey(x) !== attachmentKey(a)))}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${label}`}
                hitSlop={6}
                android_ripple={{ color: colors['surface-hover'] }}
                className="h-9 w-8 items-center justify-center"
              >
                <CloseIcon color={colors.muted} size={14} />
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {onChange ? (
        <>
          <SmallButton label={addLabel} Icon={PlusIcon} onPress={() => setPicking(true)} />
          <AttachmentPickerSheet visible={picking} selected={items} onChange={onChange} onClose={() => setPicking(false)} />
        </>
      ) : null}
    </View>
  );
}

type Tab = 'tunes' | 'setlists' | 'charts' | 'tools';
type Row = { attachment: Attachment; title: string; detail: string };

const EMPTY: Record<Tab, string> = {
  tunes: 'No tunes yet. Add some in the Library.',
  setlists: 'No setlists yet. Make one in the Library.',
  charts: 'No chord charts yet. Import or make some in the Library.',
  tools: 'No tools match.',
};

/** Pick tunes, setlists, chord charts and tools to attach: tap to add or take off, Done to close. */
function AttachmentPickerSheet({
  visible,
  selected,
  onChange,
  onClose,
}: {
  visible: boolean;
  selected: Attachment[];
  onChange: (items: Attachment[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('tunes');
  const [query, setQuery] = useState('');
  return (
    <ToolSheet visible={visible} onClose={onClose} title="Attach">
      <Segmented
        label="What to attach"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setQuery('');
        }}
        options={[
          { value: 'tunes', label: 'Tunes' },
          { value: 'setlists', label: 'Setlists' },
          { value: 'charts', label: 'Charts' },
          { value: 'tools', label: 'Tools' },
        ]}
      />
      <SearchField value={query} onChangeText={setQuery} placeholder="Search" />
      {/* Charts only load once their tab is open (the library is big). */}
      {tab === 'charts' ? (
        <ChartRows query={query} selected={selected} onChange={onChange} />
      ) : tab === 'tunes' ? (
        <TuneRows query={query} selected={selected} onChange={onChange} />
      ) : tab === 'setlists' ? (
        <SetlistRows query={query} selected={selected} onChange={onChange} />
      ) : (
        <PickRows tab="tools" query={query} rows={TOOL_LINKS.filter((l) => matches(`${l.label} ${l.category}`, query)).map((l) => ({ attachment: { kind: 'tool', href: l.href, label: l.label }, title: l.label, detail: l.category }))} selected={selected} onChange={onChange} />
      )}
      <View className="flex-row justify-end">
        <SmallButton label="Done" primary onPress={onClose} />
      </View>
    </ToolSheet>
  );
}

function matches(text: string, query: string) {
  const q = query.trim().toLowerCase();
  return !q || q.split(/\s+/).every((w) => text.toLowerCase().includes(w));
}

type RowsProps = { query: string; selected: Attachment[]; onChange: (items: Attachment[]) => void };

function TuneRows(props: RowsProps) {
  const { lists } = useTuneLists();
  const rows = useMemo(
    () =>
      sortByText(
        allTunes(lists).filter((t) => matches(t.tune.name, props.query)),
        (t) => t.tune.name,
      ).map((t): Row => ({ attachment: { kind: 'tune', id: t.tune.id, list: t.list, label: t.tune.name }, title: t.tune.name, detail: TUNE_LIST_LABEL[t.list] })),
    [lists, props.query],
  );
  return <PickRows tab="tunes" rows={rows} {...props} />;
}

function SetlistRows(props: RowsProps) {
  const { setlists } = useSetlists();
  const rows = useMemo(
    () =>
      sortByText(
        setlists.filter((s) => matches(s.name, props.query)),
        (s) => s.name,
      ).map((s): Row => ({ attachment: { kind: 'setlist', id: s.id, label: s.name }, title: s.name, detail: `${s.tuneIds.length} tune${s.tuneIds.length === 1 ? '' : 's'}` })),
    [setlists, props.query],
  );
  return <PickRows tab="setlists" rows={rows} {...props} />;
}

function ChartRows(props: RowsProps) {
  const { allSongs } = useChordChartsLibrary(null);
  const rows = useMemo(
    () =>
      sortByText(
        allSongs.filter((s) => matches(`${s.title} ${s.composer}`, props.query)),
        (s) => s.title,
      )
        .slice(0, 200)
        .map((s): Row => ({ attachment: { kind: 'chart', id: s.id, label: s.title }, title: s.title, detail: [s.composer, s.key ? prettyKeyName(s.key) : ''].filter(Boolean).join(' · ') })),
    [allSongs, props.query],
  );
  return <PickRows tab="charts" rows={rows} {...props} />;
}

function PickRows({ tab, rows, query, selected, onChange }: RowsProps & { tab: Tab; rows: Row[] }) {
  const { colors, derived } = useAppTheme();
  const keys = new Set(selected.map(attachmentKey));
  function toggle(a: Attachment) {
    const k = attachmentKey(a);
    onChange(keys.has(k) ? selected.filter((x) => attachmentKey(x) !== k) : [...selected, a]);
  }
  if (rows.length === 0) return <Muted center>{query.trim() ? 'Nothing matches.' : EMPTY[tab]}</Muted>;
  return (
    <View className="gap-1.5">
      {rows.map((r) => {
        const on = keys.has(attachmentKey(r.attachment));
        return (
          <Pressable
            key={attachmentKey(r.attachment)}
            onPress={() => toggle(r.attachment)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            android_ripple={{ color: colors['surface-hover'] }}
            className="min-h-[48px] flex-row items-center gap-3 overflow-hidden rounded-lg px-3 py-2"
            style={{ backgroundColor: derived.fill }}
          >
            <CheckBox checked={on} color={colors.accent} mark={colors['accent-foreground']} size={22} />
            <View className="flex-1">
              <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground }}>
                {r.title}
              </Text>
              {r.detail ? (
                <Text numberOfLines={1} className="font-ui text-xs" style={{ color: colors.muted }}>
                  {r.detail}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
