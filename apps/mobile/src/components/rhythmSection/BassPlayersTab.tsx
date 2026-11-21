import { BUILT_IN_PLAYERS, isBuiltInId } from '@jam-practice/core/bassBuiltIns';
import { emptyTranscription, readImportFile, type Transcription } from '@jam-practice/core/bassTranscription';
import { importMusicXml } from '@jam-practice/core/musicXml';
import { useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BassIcon, ChevronLeftIcon, PencilIcon, PlusIcon, TrashIcon, WaveIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { NameDialog } from '@/components/NameDialog';
import Score from '@/components/notation/Score';
import { PatternsSheet } from '@/components/rhythmSection/PatternsSheet';
import { TranscriptionEditor } from '@/components/rhythmSection/TranscriptionEditor';
import { pickTextFile } from '@/components/scoreWriter/pickTextFile';
import { useBackWithin } from '@/components/scoreWriter/useBackWithin';
import { formatShortDate } from '@/components/tool/ear';
import { Button, EmptyState, ListRow } from '@/components/ui';
import { useBassPlayers, useTranscription } from '@/lib/useBassPlayers';
import { useAppTheme } from '@/theme/ThemeProvider';
import { TextInput } from '@/components/ThemedTextInput';

type View_ = { kind: 'players' } | { kind: 'player'; playerId: string } | { kind: 'transcription'; playerId: string; transcriptionId: string };
type Prompt = { title: string; initial: string; confirm: string; placeholder?: string; onSubmit: (v: string) => void };
type Confirm = { title: string; message: string; confirm: string; onConfirm: () => void };

/**
 * Rhythm Section's "Bass players" on the phone — the website's `BassPlayersTab`
 * (`apps/web/components/bassgenius/BassPlayersTab.tsx`): your bass players, each with the
 * transcriptions you've written of them (in the notation editor), and their Patterns. The bass in
 * Rhythm Section plays like a player from these. The built-in players are read-only until you make
 * them your own. Import takes a bass player or transcription .json, or MusicXML (.musicxml). Back
 * steps back a page (transcription → player → players).
 */
export function BassPlayersTab() {
  const { colors } = useAppTheme();
  const lib = useBassPlayers();
  const [view, setView] = useState<View_>({ kind: 'players' });
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  // The Patterns page: one transcription's, or (null) all of the player's.
  const [patterns, setPatterns] = useState<{ transcriptionId: string | null } | null>(null);
  const importTarget = useRef<string | null>(null);

  const player = view.kind !== 'players' ? (lib.players.find((p) => p.id === view.playerId) ?? null) : null;
  const countFor = (id: string) => lib.transcriptions.filter((t) => t.playerId === id).length;
  const goBack = () => {
    if (view.kind === 'transcription') setView({ kind: 'player', playerId: view.playerId });
    else setView({ kind: 'players' });
  };
  useBackWithin(view.kind !== 'players', goBack);

  /** Copies a built-in player (and its transcriptions) into your own players, then opens it. */
  const copyBuiltIn = async (builtInId: string) => {
    const b = BUILT_IN_PLAYERS.find((x) => x.id === builtInId);
    if (!b) return;
    const id = await lib.createPlayer(b.name, b.description);
    for (const t of b.transcriptions) await lib.createTranscription(id, t.data);
    setView({ kind: 'player', playerId: id });
    setNotice({ text: `${b.name} is now one of your players — edit and add to it as you like.` });
  };
  /** Copies a built-in transcription listed under one of your players into that player, then opens the copy. */
  const copyBuiltInTranscription = async (playerId: string, transcriptionId: string) => {
    const t = BUILT_IN_PLAYERS.flatMap((b) => b.transcriptions).find((x) => x.id === transcriptionId);
    if (!t) return;
    const id = await lib.createTranscription(playerId, t.data);
    setView({ kind: 'transcription', playerId, transcriptionId: id });
    setNotice({ text: `“${t.data.title}” is now yours to edit.` });
  };

  // ── Import ──
  const pickImport = async (playerId: string | null) => {
    importTarget.current = playerId;
    setNotice(null);
    try {
      const file = await pickTextFile(['application/json', 'application/xml', 'text/xml', 'application/vnd.recordare.musicxml+xml', '*/*']);
      if (file) await onFile(file.name, file.text);
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Couldn’t import that file.', error: true });
    }
  };
  const onFile = async (name: string, text: string) => {
    if (/<score-(partwise|timewise)/.test(text.slice(0, 5000)) || /\.(musicxml|xml)$/i.test(name)) return importXml(text, name);
    const imported = readImportFile(text);
    if (imported.kind === 'player') {
      const target = importTarget.current;
      const pid = target ?? (await lib.createPlayer(imported.name, imported.description));
      for (const t of imported.transcriptions) await lib.createTranscription(pid, t);
      setNotice({ text: `Imported ${imported.transcriptions.length} transcription${imported.transcriptions.length === 1 ? '' : 's'}${target ? '' : ` as ${imported.name}`}.` });
      if (!target) setView({ kind: 'player', playerId: pid });
    } else {
      let pid = importTarget.current;
      if (!pid) {
        const wanted = imported.playerName?.trim().toLowerCase();
        const byName = wanted ? lib.players.find((p) => !p.builtIn && p.name.trim().toLowerCase() === wanted) : null;
        pid = byName?.id ?? (await lib.createPlayer(imported.playerName ?? 'Imported player'));
      }
      const id = await lib.createTranscription(pid, imported.transcription);
      setNotice({ text: `Imported “${imported.transcription.title}”.` });
      setView({ kind: 'transcription', playerId: pid, transcriptionId: id });
    }
  };
  /** MusicXML: becomes one transcription, under the player we're looking at or one you name. */
  const importXml = async (text: string, filename: string) => {
    const { transcription, warnings } = importMusicXml(text);
    if (transcription.title === 'Imported transcription') transcription.title = filename.replace(/\.(mxl|musicxml|xml)$/i, '');
    const finish = async (playerId: string) => {
      const id = await lib.createTranscription(playerId, transcription);
      setNotice({ text: [`Imported “${transcription.title}” (${transcription.measures.length} bars).`, ...warnings].join(' ') });
      setView({ kind: 'transcription', playerId, transcriptionId: id });
    };
    if (importTarget.current) return finish(importTarget.current);
    setPrompt({
      title: 'Who’s the bass player?',
      initial: '',
      confirm: 'Import',
      placeholder: 'Ray Brown',
      onSubmit: (name) => {
        const existing = lib.players.find((p) => !p.builtIn && p.name.trim().toLowerCase() === name.trim().toLowerCase());
        void (async () => finish(existing?.id ?? (await lib.createPlayer(name || 'Imported player'))))();
      },
    });
  };

  const newPlayer = () =>
    setPrompt({
      title: 'New bass player',
      initial: '',
      confirm: 'Add player',
      placeholder: 'Ray Brown',
      onSubmit: (name) => {
        void lib.createPlayer(name).then((id) => setView({ kind: 'player', playerId: id }));
      },
    });
  const newTranscription = async (playerId: string) => {
    const id = await lib.createTranscription(playerId, emptyTranscription());
    setView({ kind: 'transcription', playerId, transcriptionId: id });
  };

  const dialogs = (
    <>
      <NameDialog
        visible={!!prompt}
        title={prompt?.title ?? ''}
        initialValue={prompt?.initial ?? ''}
        placeholder={prompt?.placeholder}
        confirmLabel={prompt?.confirm}
        onSubmit={(v) => prompt?.onSubmit(v)}
        onClose={() => setPrompt(null)}
      />
      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirm ?? 'Delete'}
        onConfirm={() => {
          confirm?.onConfirm();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
  const noticeEl = notice ? (
    <View className="flex-row items-start gap-3 rounded-lg px-4 py-2.5" style={{ backgroundColor: colors.surface }} accessibilityRole="alert">
      <Text className="font-ui flex-1 text-sm leading-5" style={{ color: notice.error ? colors.danger : colors.foreground }}>
        {notice.text}
      </Text>
      <Pressable onPress={() => setNotice(null)} hitSlop={10} accessibilityLabel="Dismiss">
        <Text className="font-ui-semibold text-base font-semibold" style={{ color: colors.muted }}>
          ×
        </Text>
      </Pressable>
    </View>
  ) : null;

  if (lib.loading) {
    return (
      <View className="py-16">
        <LoadingSpinner showLabel label="Loading your bass players…" />
      </View>
    );
  }

  if (view.kind === 'transcription' && player) {
    return (
      <View className="flex-1">
        {noticeEl ? <View className="px-4 pt-3">{noticeEl}</View> : null}
        <TranscriptionView
          key={view.transcriptionId}
          id={view.transcriptionId}
          back={<BackPill label={player.name} onPress={goBack} />}
          onCopy={
            player.builtIn
              ? () => void copyBuiltIn(player.id)
              : isBuiltInId(view.transcriptionId)
                ? () => void copyBuiltInTranscription(player.id, view.transcriptionId)
                : undefined
          }
          onDelete={() =>
            setConfirm({
              title: 'Delete this transcription?',
              message: 'It’s removed for good.',
              confirm: 'Delete',
              onConfirm: () => {
                void lib.deleteTranscription(view.transcriptionId).then(() => setView({ kind: 'player', playerId: player.id }));
              },
            })
          }
        />
        {dialogs}
      </View>
    );
  }

  if (view.kind !== 'players' && player) {
    const items = lib.transcriptions.filter((t) => t.playerId === player.id);
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View className="flex-row">
          <BackPill label="Bass players" onPress={goBack} />
        </View>
        {player.builtIn ? (
          <Title>{player.name}</Title>
        ) : (
          <Pressable
            onPress={() => setPrompt({ title: 'Rename player', initial: player.name, confirm: 'Rename', onSubmit: (name) => void lib.updatePlayer(player.id, { name }) })}
            accessibilityRole="button"
            accessibilityLabel={`Rename ${player.name}`}
            className="flex-row items-center gap-2"
          >
            <View className="flex-shrink">
              <Title>{player.name}</Title>
            </View>
            <PencilIcon color={colors.muted} size={18} />
          </Pressable>
        )}
        <View className="flex-row flex-wrap gap-2">
          {items.length > 0 ? <Button label="Patterns" kind="secondary" Icon={WaveIcon} onPress={() => setPatterns({ transcriptionId: null })} /> : null}
          {player.builtIn ? (
            <Button label="Make it my own" onPress={() => void copyBuiltIn(player.id)} />
          ) : (
            <Button label="Import" kind="secondary" onPress={() => void pickImport(player.id)} />
          )}
          {!player.builtIn ? (
            <Button
              label="Delete"
              kind="secondary"
              Icon={TrashIcon}
              onPress={() =>
                setConfirm({
                  title: `Delete ${player.name}?`,
                  message: `This deletes ${player.name} and ${items.length === 1 ? 'their transcription' : `all ${items.length} of their transcriptions`}.`,
                  confirm: 'Delete',
                  onConfirm: () => {
                    void lib.deletePlayer(player.id).then(() => setView({ kind: 'players' }));
                  },
                })
              }
            />
          ) : null}
        </View>
        {player.builtIn ? (
          <Text className="font-ui rounded-lg px-4 py-3 text-sm leading-5" style={{ color: colors.muted, backgroundColor: colors.surface }}>
            {player.description} It’s read-only — Make it my own copies it into your players to edit and add to.
          </Text>
        ) : (
          <AboutField key={player.id} value={player.description} onSave={(description) => void lib.updatePlayer(player.id, { description })} />
        )}
        {noticeEl}
        <View className="flex-row items-center justify-between pt-1">
          <Text className="font-ui-semibold text-[15px] font-semibold" style={{ color: colors.foreground }}>
            Transcriptions
          </Text>
          {!player.builtIn ? <Button label="New transcription" Icon={PlusIcon} onPress={() => void newTranscription(player.id)} /> : null}
        </View>
        {items.length === 0 ? (
          <EmptyState Icon={BassIcon} title="No transcriptions yet" body="Start one with New transcription, or import a MusicXML (.musicxml) or a bass transcription .json file." />
        ) : (
          <View className="gap-2">
            {items.map((t) => (
              <ListRow
                key={t.id}
                title={t.title}
                detail={`${t.measureCount} bar${t.measureCount === 1 ? '' : 's'} · ${isBuiltInId(t.id) ? 'built in' : `edited ${formatShortDate(t.updatedAt)}`}`}
                onPress={() => setView({ kind: 'transcription', playerId: player.id, transcriptionId: t.id })}
                right={
                  <Pressable
                    onPress={() => setPatterns({ transcriptionId: t.id })}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Patterns in ${t.title}`}
                    className="h-9 w-9 items-center justify-center rounded-full"
                  >
                    <WaveIcon color={colors.muted} size={20} />
                  </Pressable>
                }
              />
            ))}
          </View>
        )}
        {dialogs}
        {patterns ? <PatternsSheet playerId={player.id} playerName={player.name} transcriptionId={patterns.transcriptionId} onClose={() => setPatterns(null)} /> : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
      <View className="gap-1">
        <Title>Bass players</Title>
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          Transcribe the players you love. The bass in Rhythm Section learns to play like them from what you write here.
        </Text>
      </View>
      <View className="flex-row gap-2">
        <Button label="Import" kind="secondary" onPress={() => void pickImport(null)} style={{ flex: 1 }} />
        <Button label="New player" Icon={PlusIcon} onPress={newPlayer} style={{ flex: 1 }} />
      </View>
      {!lib.signedIn ? (
        <Text className="font-ui text-sm leading-5" style={{ color: colors.muted }}>
          You’re signed out, so these are only saved on this phone. Sign in to keep them in your account, on the website too.
        </Text>
      ) : null}
      {noticeEl}
      <View className="gap-2">
        {lib.players.map((p) => (
          <ListRow
            key={p.id}
            icon={<BassIcon color={colors.muted} size={20} />}
            title={p.name}
            detail={`${countFor(p.id)} transcription${countFor(p.id) === 1 ? '' : 's'}${p.builtIn ? ' · built in' : ''}`}
            onPress={() => setView({ kind: 'player', playerId: p.id })}
          />
        ))}
      </View>
      {dialogs}
    </ScrollView>
  );
}

function Title({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-ui-bold text-2xl font-bold" style={{ color: colors.foreground }}>
      {children}
    </Text>
  );
}

/** Back a page, as a pill (the website's `BackButton`). */
function BackPill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, derived } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      android_ripple={{ color: colors['surface-hover'] }}
      className="h-9 flex-row items-center gap-0.5 overflow-hidden rounded-full pl-1.5 pr-3"
      style={{ backgroundColor: derived.fill }}
    >
      <ChevronLeftIcon color={colors.foreground} size={20} />
      <Text numberOfLines={1} className="font-ui-semibold text-sm font-semibold" style={{ color: colors.foreground, maxWidth: 180 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** "About this player", saved when you leave the field. */
function AboutField({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const { colors } = useAppTheme();
  const [text, setText] = useState(value);
  return (
    <TextInput
      value={text}
      onChangeText={setText}
      onEndEditing={() => text !== value && onSave(text)}
      placeholder="About this player — their sound, the records you’re transcribing…"
      placeholderTextColor={colors.muted}
      multiline
      accessibilityLabel="About this player"
      className="font-ui min-h-16 rounded-lg px-3 py-2 text-sm"
      style={{ backgroundColor: colors.surface, color: colors.foreground, textAlignVertical: 'top' }}
    />
  );
}

function TranscriptionView({ id, back, onDelete, onCopy }: { id: string; back: ReactNode; onDelete: () => void; onCopy?: () => void }) {
  const { colors } = useAppTheme();
  const { data, save, readOnly } = useTranscription(id);
  // Take the transcription once; from then on the editor owns it (its saves come back here too).
  const [initial, setInitial] = useState<Transcription | null>(null);
  if (!initial && data) setInitial(data);
  if (!initial) {
    return data === undefined ? (
      <View className="py-16">
        <LoadingSpinner showLabel label="Loading transcription…" />
      </View>
    ) : (
      <View className="gap-3 p-4">
        <View className="flex-row">{back}</View>
        <Text className="font-ui text-sm" style={{ color: colors.muted }}>
          That transcription isn’t there anymore.
        </Text>
      </View>
    );
  }
  if (readOnly) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}>
        <View className="flex-row">{back}</View>
        <Title>{initial.title}</Title>
        {initial.tune || initial.source ? (
          <Text className="font-ui text-sm" style={{ color: colors.muted }}>
            {[initial.tune, initial.source].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        {onCopy ? <Button label="Make it my own" onPress={onCopy} /> : null}
        {initial.comments ? (
          <Text className="font-ui rounded-lg px-4 py-3 text-sm leading-5" style={{ color: colors.foreground, backgroundColor: colors.surface }}>
            {initial.comments}
          </Text>
        ) : null}
        <View className="rounded-xl p-3" style={{ backgroundColor: colors.surface }}>
          <Score transcription={initial} />
        </View>
        <Text className="font-ui text-xs" style={{ color: colors.muted }}>
          Built in and read-only — make it your own to get a copy you can edit.
        </Text>
      </ScrollView>
    );
  }
  return <TranscriptionEditor initial={initial} back={back} onSave={save} onDelete={onDelete} />;
}
