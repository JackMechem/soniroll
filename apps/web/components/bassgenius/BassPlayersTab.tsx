"use client";

import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { type FileFilter, useFilePicker } from "@/components/files/FilePicker";
import PromptDialog from "@/components/PromptDialog";
import { BackButton } from "@/components/library/shared";
import { BassIcon, ChevronRightIcon, DownloadIcon, PlusIcon, TrashIcon, WaveIcon } from "@/components/tools";
import TranscriptionEditor, { downloadJson, safeFilename } from "@/components/bassgenius/TranscriptionEditor";
import PatternsDialog from "@/components/bassgenius/PatternsDialog";
import TranscriptionScore from "@/components/notation/Score";
import { BUILT_IN_PLAYERS, isBuiltInId } from "@/lib/bassBuiltIns";
import { cleanTranscription, emptyTranscription, playerFile, readImportFile, type Transcription } from "@/lib/bassTranscription";
import { decodeXmlBytes, importMusicXml } from "@/lib/musicXml";
import { looksLikeZip, readMxl } from "@/lib/mxl";
import { useBassPlayers, useTranscription } from "@/lib/useBassPlayers";

/** What the Bass players tab imports: MusicXML, or a player / transcription exported from here. */
const BASS_IMPORT: FileFilter = {
  accept: "application/json,.json,.musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml",
  matches: (f) => /\.(json|musicxml|xml|mxl)$/i.test(f.name) || /json|musicxml/.test(f.mimeType),
  noun: "a MusicXML or bass player file",
};

type View = { kind: "players" } | { kind: "player"; playerId: string } | { kind: "transcription"; playerId: string; transcriptionId: string };

/**
 * Bass Genius's "Bass players" tab: your bass players, each with the transcriptions you've written
 * of them (`TranscriptionEditor`). Players and transcriptions export/import as JSON. Nothing reads
 * the transcriptions yet — Bass Genius will learn each player's style from them later.
 */
export default function BassPlayersTab() {
  const lib = useBassPlayers();
  const [view, setView] = useState<View>({ kind: "players" });
  const [prompt, setPrompt] = useState<null | { title: string; initial: string; confirm: string; onSubmit: (v: string) => void }>(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; confirm: string; onConfirm: () => void }>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  // The Patterns page: one transcription's, or (null) all of the player's.
  const [patterns, setPatterns] = useState<{ transcriptionId: string | null } | null>(null);
  /** Copies a built-in player (and its transcriptions) into your own players, then opens it. */
  const copyBuiltIn = async (builtInId: string) => {
    const b = BUILT_IN_PLAYERS.find((x) => x.id === builtInId);
    if (!b) return;
    const id = await lib.createPlayer(b.name, b.description);
    for (const t of b.transcriptions) await lib.createTranscription(id, t.data);
    setView({ kind: "player", playerId: id });
    setNotice({ text: `${b.name} is now one of your players — edit and add to it as you like.` });
  };
  /** Copies a built-in transcription listed under one of your players into that player (the
      built-in then steps aside, since yours has its title), then opens the copy. */
  const copyBuiltInTranscription = async (playerId: string, transcriptionId: string) => {
    const t = BUILT_IN_PLAYERS.flatMap((b) => b.transcriptions).find((x) => x.id === transcriptionId);
    if (!t) return;
    const id = await lib.createTranscription(playerId, t.data);
    setView({ kind: "transcription", playerId, transcriptionId: id });
    setNotice({ text: `"${t.data.title}" is now yours to edit.` });
  };
  const importTarget = useRef<string | null>(null);

  const player = view.kind !== "players" ? lib.players.find((p) => p.id === view.playerId) ?? null : null;
  const countFor = (id: string) => lib.transcriptions.filter((t) => t.playerId === id).length;

  const pickImport = (playerId: string | null) => {
    importTarget.current = playerId;
    picker.open();
  };
  const onFile = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = looksLikeZip(bytes) ? await readMxl(bytes) : decodeXmlBytes(bytes);
      if (/<score-(partwise|timewise)/.test(text.slice(0, 5000)) || /\.(mxl|musicxml|xml)$/i.test(file.name)) {
        await importXml(text, file.name);
        return;
      }
      const imported = readImportFile(text);
      if (imported.kind === "player") {
        const target = importTarget.current;
        const pid = target ?? (await lib.createPlayer(imported.name, imported.description));
        for (const t of imported.transcriptions) await lib.createTranscription(pid, t);
        setNotice({ text: `Imported ${imported.transcriptions.length} transcription${imported.transcriptions.length === 1 ? "" : "s"}${target ? "" : ` as ${imported.name}`}.` });
        if (!target) setView({ kind: "player", playerId: pid });
      } else {
        let pid = importTarget.current;
        if (!pid) {
          const byName = imported.playerName ? lib.players.find((p) => p.name.trim().toLowerCase() === imported.playerName!.trim().toLowerCase()) : null;
          pid = byName?.id ?? (await lib.createPlayer(imported.playerName ?? "Imported player"));
        }
        const id = await lib.createTranscription(pid, imported.transcription);
        setNotice({ text: `Imported “${imported.transcription.title}”.` });
        setView({ kind: "transcription", playerId: pid, transcriptionId: id });
      }
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Couldn't import that file.", error: true });
    }
  };

  /** MusicXML: becomes one transcription, under the player we're looking at or one you name. */
  const importXml = async (text: string, filename: string) => {
    const { transcription, warnings } = importMusicXml(text);
    if (transcription.title === "Imported transcription") transcription.title = filename.replace(/\.(mxl|musicxml|xml)$/i, "");
    const finish = async (playerId: string) => {
      const id = await lib.createTranscription(playerId, transcription);
      setNotice({ text: [`Imported “${transcription.title}” (${transcription.measures.length} bars).`, ...warnings].join(" ") });
      setView({ kind: "transcription", playerId, transcriptionId: id });
    };
    if (importTarget.current) return finish(importTarget.current);
    setPrompt({
      title: "Who's the bass player?",
      initial: "",
      confirm: "Import",
      onSubmit: async (name) => {
        const existing = lib.players.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase());
        await finish(existing?.id ?? (await lib.createPlayer(name || "Imported player")));
      },
    });
  };

  // Import: a MusicXML file from your Files (signed in) or from this device.
  const picker = useFilePicker({ filter: BASS_IMPORT, title: "Import a transcription", onFile: (file) => void onFile(file) });

  const newPlayer = () =>
    setPrompt({
      title: "New bass player",
      initial: "",
      confirm: "Add player",
      onSubmit: async (name) => {
        const id = await lib.createPlayer(name);
        setView({ kind: "player", playerId: id });
      },
    });

  const newTranscription = async (playerId: string) => {
    const id = await lib.createTranscription(playerId, emptyTranscription());
    setView({ kind: "transcription", playerId, transcriptionId: id });
  };

  const exportPlayer = async (playerId: string, name: string, description: string) => {
    // Pulls each transcription's notes (the list only has titles).
    const items = lib.transcriptions.filter((t) => t.playerId === playerId);
    const full: Transcription[] = [];
    for (const item of items) {
      const data = await lib.fetchTranscription(item.id);
      if (data) full.push(cleanTranscription(data));
    }
    downloadJson(playerFile(name, description, full), `${safeFilename(name)}.json`);
  };

  const fileInput = picker.elements;
  const dialogs = (
    <>
      {prompt && (
        <PromptDialog
          title={prompt.title}
          initialValue={prompt.initial}
          confirmLabel={prompt.confirm}
          placeholder="Ray Brown"
          onSubmit={(v) => {
            prompt.onSubmit(v);
            setPrompt(null);
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirm}
          onConfirm={() => {
            confirm.onConfirm();
            setConfirm(null);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
  const noticeEl = notice && (
    <div className={`flex items-start gap-3 rounded-md border px-4 py-2 text-left text-sm ${notice.error ? "border-danger/30 text-danger" : "border-foreground/15 text-foreground"}`} role="status">
      <p className="flex-1">{notice.text}</p>
      <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-muted hover:text-foreground">
        ×
      </button>
    </div>
  );

  if (lib.loading) return <LoadingSpinner label="Loading your bass players…" showLabel />;

  if (view.kind === "transcription" && player) {
    return (
      <div className="flex w-full max-w-5xl flex-col gap-3">
        {noticeEl}
        <TranscriptionView
          key={view.transcriptionId}
          id={view.transcriptionId}
          playerName={player.name}
          onBack={() => setView({ kind: "player", playerId: player.id })}
          onCopy={player.builtIn ? () => void copyBuiltIn(player.id) : isBuiltInId(view.transcriptionId) ? () => void copyBuiltInTranscription(player.id, view.transcriptionId) : undefined}
          onDelete={() =>
            setConfirm({
              title: "Delete this transcription?",
              message: "It's removed from your account. Export it first if you might want it back.",
              confirm: "Delete",
              onConfirm: async () => {
                await lib.deleteTranscription(view.transcriptionId);
                setView({ kind: "player", playerId: player.id });
              },
            })
          }
        />
        {dialogs}
      </div>
    );
  }

  if (view.kind !== "players" && player) {
    const items = lib.transcriptions.filter((t) => t.playerId === player.id);
    return (
      <div className="flex w-full max-w-3xl flex-col gap-4 text-left">
        <div>
          <BackButton onClick={() => setView({ kind: "players" })} label="Bass players" className="mb-2" />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {player.builtIn ? (
              <h2 className="text-2xl font-semibold tracking-tight">{player.name}</h2>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setPrompt({ title: "Rename player", initial: player.name, confirm: "Rename", onSubmit: (name) => void lib.updatePlayer(player.id, { name }) })
                }
                className="text-left text-2xl font-semibold tracking-tight hover:text-accent"
                title="Rename"
              >
                {player.name}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPatterns({ transcriptionId: null })}
                  className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover"
                  title={`Patterns across all of ${player.name}'s transcriptions`}
                >
                  <WaveIcon className="h-4 w-4" /> Patterns
                </button>
              )}
              {player.builtIn ? (
                <button type="button" onClick={() => void copyBuiltIn(player.id)} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
                  Make it my own
                </button>
              ) : (
                <button type="button" onClick={() => pickImport(player.id)} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
                  Import
                </button>
              )}
              <button type="button" onClick={() => void exportPlayer(player.id, player.name, player.description)} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
                <DownloadIcon className="h-4 w-4" /> Export player
              </button>
              {!player.builtIn && (
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: `Delete ${player.name}?`,
                    message: `This deletes ${player.name} and ${items.length === 1 ? "their transcription" : `all ${items.length} of their transcriptions`}.`,
                    confirm: "Delete",
                    onConfirm: async () => {
                      await lib.deletePlayer(player.id);
                      setView({ kind: "players" });
                    },
                  })
                }
                aria-label="Delete player"
                className="flex h-9 w-9 items-center justify-center rounded-md bg-foreground/[0.05] text-muted transition-colors hover:bg-surface-hover hover:text-danger"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
              )}
            </div>
          </div>
        </div>
        {player.builtIn ? (
          <p className="rounded-lg bg-foreground/[0.05] px-4 py-3 text-sm text-muted">
            {player.description} It&apos;s read-only — <strong>Make it my own</strong> copies it into your players to edit and add to.
          </p>
        ) : (
        <textarea
          defaultValue={player.description}
          onBlur={(e) => e.target.value !== player.description && void lib.updatePlayer(player.id, { description: e.target.value })}
          placeholder="About this player — their sound, the records you're transcribing…"
          rows={2}
          className="rounded-md bg-foreground/[0.05] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          aria-label="About this player"
        />
        )}
        {noticeEl}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Transcriptions</h2>
          {!player.builtIn && (
          <button type="button" onClick={() => void newTranscription(player.id)} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            <PlusIcon className="h-4 w-4" /> New transcription
          </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-foreground/15 p-6 text-center text-sm text-muted">No transcriptions yet. Start one, or import a MusicXML (.musicxml, .mxl) or a bass transcription .json file.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
            {items.map((t) => (
              <li key={t.id} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => setView({ kind: "transcription", playerId: player.id, transcriptionId: t.id })}
                  className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.title}</span>
                    <span className="block text-xs text-muted">
                      {t.measureCount} bar{t.measureCount === 1 ? "" : "s"} · {isBuiltInId(t.id) ? "built in" : `edited ${new Date(t.updatedAt).toLocaleDateString()}`}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-muted" />
                </button>
                <button
                  type="button"
                  onClick={() => setPatterns({ transcriptionId: t.id })}
                  className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  title="Patterns in this transcription"
                >
                  <WaveIcon className="h-4 w-4" /> <span className="hidden sm:inline">Patterns</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {fileInput}
        {dialogs}
        {patterns && (
          <PatternsDialog playerId={player.id} playerName={player.name} transcriptionId={patterns.transcriptionId} onClose={() => setPatterns(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-3xl flex-col gap-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Bass players</h2>
          <p className="text-sm text-muted">Transcribe the players you love. The bass in Rhythm Section learns to play like them from what you write here.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => pickImport(null)} className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium transition-colors hover:bg-surface-hover">
            Import
          </button>
          <button type="button" onClick={newPlayer} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
            <PlusIcon className="h-4 w-4" /> New player
          </button>
        </div>
      </div>
      {!lib.signedIn && (
        <p className="rounded-md bg-foreground/[0.05] px-4 py-2 text-sm text-muted">You&apos;re signed out, so these are only saved in this browser. Sign in to keep them in your account.</p>
      )}
      {noticeEl}
      {lib.players.length === 0 ? (
        <button type="button" onClick={newPlayer} className="rounded-lg border border-dashed border-foreground/15 p-6 text-sm text-muted transition-colors hover:border-foreground/30 hover:text-foreground">
          Add your first bass player — Ray Brown, Paul Chambers, Ron Carter…
        </button>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg bg-surface">
          {lib.players.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setView({ kind: "player", playerId: p.id })} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-hover">
                <BassIcon className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {countFor(p.id)} transcription{countFor(p.id) === 1 ? "" : "s"}
                    {p.builtIn ? " · built in" : ""}
                  </span>
                </span>
                <ChevronRightIcon className="h-4 w-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {fileInput}
      {dialogs}
    </div>
  );
}

function TranscriptionView({
  id,
  playerName,
  onBack,
  onDelete,
  onCopy,
}: {
  id: string;
  playerName: string;
  onBack: () => void;
  onDelete: () => void;
  /** For a built-in (read-only) transcription: copy its player into your own. */
  onCopy?: () => void;
}) {
  const { data, save, readOnly } = useTranscription(id);
  // Take the transcription once; from then on the editor owns it (its saves come back here too).
  const [initial, setInitial] = useState<Transcription | null>(null);
  if (!initial && data) setInitial(data);
  if (!initial) return data === undefined ? <LoadingSpinner label="Loading transcription…" showLabel /> : <p className="text-sm text-muted">That transcription isn&apos;t there anymore.</p>;
  if (readOnly)
    return (
      <div className="flex w-full flex-col gap-4 text-left">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <BackButton onClick={onBack} label={playerName} className="mb-2" />
            <h2 className="text-xl font-semibold tracking-tight">{initial.title}</h2>
            <p className="text-sm text-muted">{[initial.tune, initial.source].filter(Boolean).join(" · ")}</p>
          </div>
          {onCopy && (
            <button type="button" onClick={onCopy} className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover">
              Make it my own
            </button>
          )}
        </div>
        {initial.comments && <p className="rounded-lg bg-foreground/[0.05] px-4 py-3 text-sm">{initial.comments}</p>}
        <div className="rounded-lg bg-surface p-3 sm:p-5">
          <TranscriptionScore transcription={initial} cursor={null} playing={null} mode="select" onSelect={noop} onAdd={noop} onReplace={noop} onChordClick={noop} />
        </div>
        <p className="text-xs text-muted">Built in and read-only — make it your own to get an editable copy.</p>
      </div>
    );
  return <TranscriptionEditor initial={initial} playerName={playerName} onSave={save} onBack={onBack} onDelete={onDelete} />;
}

const noop = () => {};
