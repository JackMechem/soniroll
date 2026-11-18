"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import AvatarUpload from "@/components/AvatarUpload";
import BannerPicker from "@/components/BannerPicker";
import Hint from "@/components/Hint";
import LoadingSpinner from "@/components/LoadingSpinner";
import SwitchRow from "@/components/SwitchRow";
import { BUTTON_PRIMARY, INPUT, SettingsCard } from "@/components/settings/SettingsSections";
import { PlusIcon, TrashIcon } from "@/components/tools";
import { COMMON_INSTRUMENTS } from "@/lib/profileInstruments";
import { normalizeUsername, usernameError } from "@/lib/username";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

/** The Public Profile tab of `/account` — username, picture, instruments played, and the public/
    private toggle. There's no tune picker here: a public profile always shows *every* tune from
    the "Tunes" and "Tunes to Learn" tabs automatically (see `convex/profiles.ts`'s
    `getPublicByUsername`), per an explicit request to stop asking which ones to show — this only
    reads `useSyncedTunes()`/`useTunesToLearn()` for the live counts shown below, nothing to edit.
    Local editable state is seeded once from `api.profiles.getMine` (the `initialized` guard
    below), then the form owns it until Save — not kept in continuous sync with the query after
    that, or every keystroke would fight a query that hasn't caught up to the edit yet. */
export default function PublicProfileEditor() {
  const profile = useQuery(api.profiles.getMine);
  const upsertProfile = useMutation(api.profiles.upsertProfile);
  const [tunes] = useSyncedTunes();
  const [tunesToLearn] = useTunesToLearn();

  const [initialized, setInitialized] = useState(false);
  const [username, setUsername] = useState("");
  const [instruments, setInstruments] = useState<string[]>([]);
  const [instrumentInput, setInstrumentInput] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [showPractice, setShowPractice] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile === undefined || initialized) return;
    // This is the one legitimate case for setState-in-effect: seeding editable local form state
    // from an async-loaded query, exactly once when it first arrives (guarded by `initialized`
    // above) — there's no "derive during render" equivalent for "start editable state from a
    // value that only exists after a network round-trip".
    /* eslint-disable react-hooks/set-state-in-effect */
    setInitialized(true);
    if (profile) {
      setUsername(profile.username);
      setInstruments(profile.instruments);
      setIsPublic(profile.isPublic);
      setShowPractice(profile.showPracticeStats !== false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [profile, initialized]);

  const normalizedUsername = normalizeUsername(username);
  const formatError = usernameError(username);
  const usernameChanged = !profile || profile.username !== normalizedUsername;
  const availability = useQuery(
    api.profiles.usernameAvailable,
    !formatError && usernameChanged ? { username: normalizedUsername } : "skip",
  );
  const usernameTaken = usernameChanged && availability === false;

  function addInstrument(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (instruments.some((i) => i.toLowerCase() === trimmed.toLowerCase())) return;
    setInstruments([...instruments, trimmed]);
    setInstrumentInput("");
  }

  function removeInstrument(name: string) {
    setInstruments(instruments.filter((i) => i !== name));
  }

  async function onSave() {
    setError(null);
    setSaved(false);
    if (formatError) {
      setError(formatError);
      return;
    }
    if (usernameTaken) {
      setError("That username is already taken.");
      return;
    }
    setSaving(true);
    try {
      await upsertProfile({
        username: normalizedUsername,
        instruments,
        isPublic,
        showPracticeStats: showPractice,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your profile.");
    } finally {
      setSaving(false);
    }
  }

  if (profile === undefined) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-lg bg-surface p-5">
        <LoadingSpinner />
      </section>
    );
  }

  return (
    <>
    <SettingsCard hints={false} title="Picture and banner" description="Shown on your public profile and next to your posts.">
      <AvatarUpload avatarUrl={profile?.avatarUrl ?? null} />
      <BannerPicker banner={profile?.banner} />
    </SettingsCard>

    <SettingsCard
      hints={false}
      title="Public profile"
      description="An optional public page other people can find and follow — nothing here is visible to anyone until you turn “Make profile public” on below."
      footer={
        <>
          {error ? <p className="min-w-0 flex-1 text-danger">{error}</p> : saved ? <p className="min-w-0 flex-1 text-accent">Profile saved.</p> : <span className="flex-1" />}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !!formatError || usernameTaken}
            className={BUTTON_PRIMARY}
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </>
      }
    >
      <label className="flex max-w-sm flex-col gap-1 text-sm">
        <span className="text-xs font-medium text-muted">Username</span>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. johndoe"
          className={INPUT}
        />
        {formatError ? (
          <p className="text-xs text-danger">{formatError}</p>
        ) : usernameChanged && availability === undefined ? (
          <p className="text-xs text-muted">Checking availability…</p>
        ) : usernameTaken ? (
          <p className="text-xs text-danger">That username is already taken.</p>
        ) : usernameChanged ? (
          <p className="text-xs text-accent">Available.</p>
        ) : null}
        <Hint>
          This has nothing to do with how you sign in — it&apos;s a separate, public identity
          (soniroll.com/u/{normalizedUsername || "…"}), only shown if your profile is public.
        </Hint>
      </label>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted">Instruments played</span>
        <div className="flex flex-wrap gap-2">
          {instruments.map((name) => (
            <span
              key={name}
              className="flex h-7 items-center gap-1.5 rounded-md bg-background pl-2.5 pr-1.5 text-xs font-medium"
            >
              {name}
              <button
                type="button"
                onClick={() => removeInstrument(name)}
                aria-label={`Remove ${name}`}
                className="text-muted hover:text-danger"
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex max-w-sm items-center gap-1.5">
          <input
            type="text"
            value={instrumentInput}
            onChange={(e) => setInstrumentInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addInstrument(instrumentInput);
              }
            }}
            placeholder="Type an instrument and press Enter"
            className={`min-w-0 flex-1 ${INPUT}`}
          />
          <button
            type="button"
            onClick={() => addInstrument(instrumentInput)}
            aria-label="Add instrument"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted hover:bg-surface-hover hover:text-foreground"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_INSTRUMENTS.filter(
            (name) => !instruments.some((i) => i.toLowerCase() === name.toLowerCase()),
          ).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => addInstrument(name)}
              className="h-7 rounded-md border border-dashed border-foreground/15 px-2 text-xs text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              + {name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-md bg-foreground/[0.05] p-3 text-sm">
        <p>
          <span className="font-medium">{tunes.length}</span> tune{tunes.length === 1 ? "" : "s"}{" "}
          and <span className="font-medium">{tunesToLearn.length}</span> tune
          {tunesToLearn.length === 1 ? "" : "s"} to learn show on your public profile.
        </p>
        <p className="text-xs text-muted">
          Manage them from the Tunes and Tunes to Learn tabs — every tune there shows here
          automatically, there&apos;s nothing to pick.
        </p>
      </div>

      <SwitchRow
        label="Make profile public"
        checked={isPublic}
        onChange={setIsPublic}
        disabled={!profile && username.trim().length === 0}
        hint="Anyone can find and view a public profile, even without an account — including in search results on the Community page."
      />
      <SwitchRow
        label="Show my Shed Log stats on my profile"
        checked={showPractice}
        onChange={setShowPractice}
        hint="Your streak, best streak, hours, days practiced, the last 26 weeks and milestones. Never your routines, tasks or notes."
      />

    </SettingsCard>
    </>
  );
}
