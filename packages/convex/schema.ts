import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/** Where a file, recording or tune song keeps its data when it isn't in Convex file storage: on
    the device that saved it (free accounts — see `lib/storage.ts`). `key` finds it in that
    device's store (IndexedDB, `apps/web/lib/deviceFiles.ts`); `label` says which device, for the
    others ("Firefox on Linux"). */
const onDevice = v.object({ key: v.string(), label: v.string() });

export default defineSchema({
  ...authTables,

  /** A code emailed to confirm a sensitive account action before it actually happens — see
      `convex/account.ts`'s `request*`/`confirm*` action pairs. One row per `(userId, kind)`; a
      fresh request replaces any existing pending one for that same kind (no stacking multiple
      live codes). Stores a SHA-256 hash of the code, not the code itself. */
  pendingConfirmations: defineTable({
    userId: v.id("users"),
    kind: v.union(v.literal("deleteAccount"), v.literal("password")),
    codeHash: v.string(),
    expiresAt: v.number(),
  }).index("by_user_kind", ["userId", "kind"]),

  /** One saved Practice Timer session per row (mirrors `lib/practiceTimer.ts`'s `PracticeSession`
      union, minus its own `id` — the Convex document id is the id once synced). Signed-in-only:
      when signed out, the exact same shape lives client-side in localStorage instead
      (`lib/practiceSessionsStore.ts`) — see `lib/usePracticeSessions.ts`, which switches between
      the two with no merge, per Jack's call: signing in reads the account's data only, local data
      already on the device is simply not consulted. */
  practiceSessions: defineTable({
    userId: v.id("users"),
    name: v.string(),
    type: v.union(v.literal("custom"), v.literal("pomodoro")),
    segments: v.optional(v.array(v.object({ id: v.string(), title: v.string(), minutes: v.number() }))),
    pomodoro: v.optional(
      v.object({
        workMinutes: v.number(),
        shortBreakMinutes: v.number(),
        longBreakMinutes: v.number(),
        workTitles: v.array(v.string()),
        cyclesBeforeLongBreak: v.number(),
        totalCycles: v.union(v.number(), v.null()),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Generic account-wide sync for every other tool's settings — one row per `(userId, key)`,
      `value` holding that tool's *entire* localStorage-equivalent settings object, JSON-stringified
      whole. Deliberately not a hand-typed table per tool: nearly every tool component already
      round-trips its own settings object through `JSON.stringify`/`JSON.parse` for
      `usePersistedSettings` (`lib/usePersistedSettings.ts`), so it's already guaranteed
      JSON-safe — storing it as one opaque blob here means a new tool, or a new field on an
      existing tool's settings, never needs a matching schema change on this side. `key` is each
      tool's own existing localStorage key string, reused as-is (e.g.
      `"jam-practice-note-trainer"`, `"jam-practice-metronome"`), so there's exactly one obvious
      `key` per synced call site, not a second naming scheme to keep in sync alongside it.
      `lib/useSyncedSettings.ts` is the one hook every synced tool's settings go through — same
      no-merge rule as
      `practiceSessions` above: signed out reads/writes localStorage only (unchanged,
      zero-risk — it's still the exact same `usePersistedSettings` code underneath), signed in
      reads/writes this table only, and whatever's already in localStorage on that device is
      simply never consulted once signed in. Reused as-is (same table, no schema change) for
      `lib/useSyncedTunes.ts` (Jam Practice's tune list — not itself a `usePersistedSettings`
      object, but the exact same "one JSON blob per key" shape fits it too) under the fixed key
      `"tunes"`. */
  syncedSettings: defineTable({
    userId: v.id("users"),
    key: v.string(),
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_user_key", ["userId", "key"]),

  /** A user's public-facing profile — this app's first data that's ever visible to anyone other
      than its own owner. `username` is always lowercased before storing (one field, no separate
      display-case, so "@JohnSmith" and "@johnsmith" can't read as two different things) and has
      nothing to do with how you sign in — a separate identity you opt into. `instruments` is
      deliberately free text, not `lib/instruments.ts`'s `INSTRUMENTS` catalog (that list is
      range-specific for the note trainers — six different "Keyboard — N Key" entries, nothing for
      Drums/Voice — a bad semantic fit for "what do you play"; see `lib/profileInstruments.ts`'s
      `COMMON_INSTRUMENTS` for the autocomplete-only suggestion list). A public profile's tune
      lists (`convex/profiles.ts`'s `getPublicByUsername`) aren't stored here at all — they're
      *every* tune in the owner's own `"tunes"`/`"tunesToLearn"` `syncedSettings` rows, resolved
      live at read time, not a curated subset; see that function's own comment for why there's
      nothing to pick here. None of this is visible to anyone while `isPublic` is false — see
      `convex/profiles.ts` for exactly which queries require that flag.
      `knownTuneIds` is a deprecated, no-longer-written leftover from an earlier design (a curated
      subset of tunes to show, picked by hand) — kept `optional` rather than removed so existing
      rows that still have it don't fail schema validation; new code never reads or writes it. */
  profiles: defineTable({
    userId: v.id("users"),
    username: v.string(),
    avatarStorageId: v.optional(v.id("_storage")),
    instruments: v.array(v.string()),
    knownTuneIds: v.optional(v.array(v.string())),
    isPublic: v.boolean(),
    /** Show Shed Log stats (streaks, hours, milestones) on the public profile. Missing = yes. */
    showPracticeStats: v.optional(v.boolean()),
    /** The profile banner: one of the built-in designs (an id from the web app's
        `lib/banners.ts`), or an uploaded image (`bannerStorageId`, which wins when set). */
    bannerPreset: v.optional(v.string()),
    bannerStorageId: v.optional(v.id("_storage")),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_username", ["username"]),

  /** One row per follow relationship — `followerId` follows `followingId`. `by_pair` is what
      `convex/follows.ts`'s `follow` mutation checks first to stay idempotent (never inserts a
      second row for the same pair). Both Following and Followers show on a profile
      (`by_follower`/`by_following` respectively), gated the same way the rest of a profile is:
      always visible for your own account, otherwise only if that profile is `isPublic` — a
      private profile's social graph stays private too, not just its tune list. */
  follows: defineTable({
    followerId: v.id("users"),
    followingId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_follower", ["followerId"])
    .index("by_following", ["followingId"])
    .index("by_pair", ["followerId", "followingId"]),

  /** Community's **one and only post type** — a tune, or a whole tune list, posted for any
      signed-in account to browse and import. `tunes` is a snapshot of `PublicTune[]`
      (`lib/profileTunes.ts` — name/tempos/keys/time signature, never `notes`) taken from the
      poster's own Tunes list at post time, not a live reference to it, stored as `v.any()` since
      `PublicTune[]` is already a stable, hand-typed shape and storing it as an opaque blob means a
      future field added to it doesn't also need a schema migration here.
      **A chord chart can only ever be posted by being attached to a tune** — each `PublicTune` in
      `tunes` may carry its own `linkedChart` (a fully-resolved snapshot, set at post time by
      `convex/communityTunes.ts`'s `create` via `resolveLinkedChart`, from that tune's own
      `chordChartId` — see `Tune`'s own doc comment in `@jam-practice/core/types` for how a tune
      gets linked to a chart in the first place). There used to be a second, separate post type
      (`communityChordCharts`/`communityChordChartSongs`, a chart or chart-playlist with no tune
      attached) — removed outright per an explicit request to stop the two post types from being
      "quite confusing": now there's exactly one thing to post, and a chart is just something a
      tune can optionally carry along with it. Searching for a chart specifically is still
      possible — see `convex/communityTunes.ts`'s `chartTitlesOf`/the `chartCount` field each
      summary carries, which is what a "chord charts" search scope filters on.
      Posting requires the caller's own profile to be `isPublic`; browsing just needs to be signed
      in, and a post is dropped from every read once its author's profile isn't (or is no longer)
      public, same privacy rule as everywhere else in this app.
      `likeCount` is denormalized here (kept in sync by `communityTunes.ts`'s `toggleLike`, inside
      the same mutation that writes `communityTuneLikes` below) specifically so showing a list of
      posts never has to separately count each one's own likes — the same "don't make reading a
      list cost more as more side-data piles up" reasoning `chordChartSongs`'s own metadata/`bars`
      split already follows elsewhere in this file. `optional` since every post created before
      liking existed doesn't have it — every reader treats a missing one as `0` (`row.likeCount ??
      0`), not a migration.
      `unlisted` (default `false`, same "missing means false" treatment as `likeCount`'s missing-
      means-zero) opts a post out of `list`/`listByUser` — the two *browsable* surfaces — without
      touching anything else: `get` (a direct link to the post, what "Share" copies) and `mine`
      (the poster's own post-management list) both work exactly the same regardless. The point
      isn't privacy from Convex's own access-control perspective (any signed-in account that
      already has `get`'s id can still open it, same as a listed post) — it's "don't show up where
      people browse," so a poster can share a link to something without it also becoming
      discoverable to everyone else. */
  communityTunes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    description: v.string(),
    tunes: v.any(),
    likeCount: v.optional(v.number()),
    unlisted: v.optional(v.boolean()),
    /** "setlist" when posted as a setlist (an ordered list meant to be played in that order —
        shown numbered, savable as the viewer's own setlist); absent for a plain tune post. */
    kind: v.optional(v.union(v.literal("setlist"), v.literal("routine"), v.literal("milestone"))),
    /** For a routine post: the poster's Shed Log routine id (shown live, `payload` the
        fallback snapshot); for a milestone post nothing. */
    routineId: v.optional(v.string()),
    /** A routine post's `PublicRoutine`, or a milestone post's `ProgressCard`
        (`packages/core/practiceLog.ts`). `tunes` is empty for both. */
    payload: v.optional(v.any()),
    /** The poster's own setlist id (from their synced setlists) — set for a setlist post, which
        then always shows that setlist's *current* tunes (`lib/setlists.ts`'s `liveSetlist`);
        `tunes` is just the fallback snapshot if the setlist's later deleted. */
    setlistId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_createdAt", ["createdAt"]),

  /** One row per `(userId, postId)` like — who liked what is never exposed (`communityTunes.ts`
      only ever reads this table scoped to *the caller's own* `userId`, via `by_user`/
      `by_user_post`; nothing reads it by `by_post` except to recount/cascade-delete, never to list
      likers), only the aggregate count (`communityTunes.likeCount`, above) and "did *I* like this"
      (`myLikes`) are ever exposed. `by_user_post` is what makes liking idempotent — `toggleLike`
      checks it first to decide insert-vs-delete, so double-tapping can't double-count. Liking
      requires being signed in (same as posting); there's no privacy gate on the *like* itself
      beyond that — if you can see a post at all (already filtered by the time a client has its id),
      you can like it. */
  communityTuneLikes: defineTable({
    userId: v.id("users"),
    postId: v.id("communityTunes"),
    createdAt: v.number(),
  })
    .index("by_user_post", ["userId", "postId"])
    .index("by_user", ["userId"])
    .index("by_post", ["postId"]),

  /** A signed-in user's personal Chord Charts library — replaces an earlier version of this
      feature that stored the *whole* library (every song's full parsed bar list) as one
      `syncedSettings` blob. That broke for real: importing a large iReal Pro playlist produced a
      single JSON document over Convex's 1 MiB per-document limit, and the write was rejected
      outright (`Value is too large (4.62 MiB > maximum size 1 MiB)`). Split across three tables
      instead, specifically so no single document's size grows with the size of the library:
      - `chordChartPlaylists` — just a name. Charts live once in the library ("All charts") and a
        playlist only *references* them, so one chart can be in several playlists. A chart's
        memberships are its own `playlistId` (optional — the first playlist it landed in, kept on
        the row so the common one-playlist case costs no extra reads and older data needs no
        migration) plus any `chordChartPlaylistEntries` rows. No `songIds` array on the playlist
        row, which would grow unboundedly for a big playlist.
      - `chordChartSongs` — one row per song, metadata only (title/composer/style/key/time
        signature) — deliberately *not* `bars`, so listing or deduping a library never has to
        touch each song's own (often much larger) notation.
      - `chordChartSongBars` — a song's parsed bar list, split into its own table so a single
        tune's notation is the only thing that ever has to fit under the 1 MiB limit, never the
        whole library or even a whole playlist. Fetched only for whichever one song is actually
        displayed (`convex/chordCharts.ts`'s `getSongBars`) — never all at once as part of listing
        the library. A chart posted to Community travels as part of its tune's own `linkedChart`
        snapshot (see `communityTunes`'s own comment) — `convex/lib/chordCharts.ts`'s
        `resolveLinkedChart` reads straight from this table server-side, never through the client.
      Signed out, this tool is entirely unaffected and keeps using the original single-blob
      `syncedSettings` approach via `lib/chordChartsLibrary.ts` — localStorage doesn't enforce
      anything like Convex's 1 MiB-per-document limit, so there's no equivalent failure mode to
      fix there. `convex/chordCharts.ts`'s `migrateFromSyncedSettings` is a one-time, entirely
      server-side migration for anyone who already had a (successfully-synced, and therefore
      already-under-1-MiB) library stored the old way before this change. */
  /** A setlist shared by link — a snapshot of one of the owner's setlists (which live in their
      synced settings, `jam-practice-setlists`): title, description, and its tunes as
      `PublicTune[]` with each linked chord chart resolved into a `linkedChart` snapshot (same shape
      and privacy rule as a Community post — never a tune's private `notes`). Readable by anyone
      with the id, signed in or not (`setlists.ts`'s `getShared`): sending the link is the sharing.
      Re-sharing updates the same row, so a link someone already has keeps working. */
  /** Shed Log routines shared by link (`routines.ts`): the link always shows the owner's
      routine as it is now (read from their `jam-practice-practice-log` synced blob); `routine` is
      the `PublicRoutine` snapshot, used if they've since deleted it. */
  sharedRoutines: defineTable({
    userId: v.id("users"),
    routineId: v.string(),
    routine: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_routine", ["userId", "routineId"]),

  sharedSetlists: defineTable({
    userId: v.id("users"),
    /** The owner's setlist id — the link always shows that setlist's current version; the stored
        title/description/tunes are only a fallback if it's deleted. */
    setlistId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    tunes: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  chordChartPlaylists: defineTable({
    userId: v.id("users"),
    name: v.string(),
    createdAt: v.number(),
    /** Being deleted: hidden from the library at once while its charts are removed in batches
        in the background (`chordCharts.ts`'s `purgePlaylist`) — one mutation can't delete a
        1,000+ chart playlist within Convex's per-function read limit. */
    deleting: v.optional(v.boolean()),
  }).index("by_user", ["userId"]),

  chordChartSongs: defineTable({
    userId: v.id("users"),
    /** One playlist this chart is in (see `chordChartPlaylists`'s comment) — absent when it's in
        none, or only in playlists listed in `chordChartPlaylistEntries`. */
    playlistId: v.optional(v.id("chordChartPlaylists")),
    title: v.string(),
    composer: v.string(),
    style: v.string(),
    key: v.string(),
    timeSignature: v.object({ top: v.number(), bottom: v.number() }),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_playlist", ["playlistId"]),

  /** A chart's *other* playlist memberships, beyond `chordChartSongs.playlistId`. */
  chordChartPlaylistEntries: defineTable({
    userId: v.id("users"),
    playlistId: v.id("chordChartPlaylists"),
    songId: v.id("chordChartSongs"),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_playlist", ["playlistId"])
    .index("by_song", ["songId"]),

  chordChartSongBars: defineTable({
    songId: v.id("chordChartSongs"),
    bars: v.any(),
  }).index("by_song", ["songId"]),

  /** Audio recordings (the Recorder tool): the file lives in Convex file storage, this row holds
      what's shown about it. `tuneId` links it to one of the owner's tunes — tunes live inside the
      owner's `syncedSettings` blob (`"tunes"` / `"jam-practice-tunes-to-learn"`), so it's a plain
      string id, not a document id; a recording whose tune has since been deleted just shows as
      unlinked. Private to the owner. */
  /** Lessons: a teacher's student. The teacher adds them by name (and can start adding things
      for them straight away); `code` is the student's invite link (`/lessons/join?invite=`). Opening
      it signed in and joining sets `studentId`. One row per teacher–student pair. */
  lessonStudents: defineTable({
    teacherId: v.id("users"),
    name: v.string(),
    code: v.string(),
    studentId: v.optional(v.id("users")),
    joinedAt: v.optional(v.number()),
    /** The address the invite was last emailed to, and when. */
    inviteEmail: v.optional(v.string()),
    invitedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_teacher", ["teacherId"])
    .index("by_student", ["studentId"])
    .index("by_code", ["code"]),

  /** One thing a teacher gave a student (`lessonId`): lesson notes, a file (PDF / image, in
      Convex storage), a chord chart (a copy, `chart`), an assignment (due date, ticked done by the
      student) or a Shed Log routine (`routine`, a full `Routine`; the student's app copies it into
      their Shed Log as `lesson-<item id>`, and the teacher reads their log for it). */
  lessonItems: defineTable({
    lessonId: v.id("lessonStudents"),
    teacherId: v.id("users"),
    /** The lesson (`lessonSessions`) it belongs to. Routines have none (they're for the student,
        not one lesson); items from before lessons existed have none and show under "Earlier". */
    sessionId: v.optional(v.id("lessonSessions")),
    kind: v.union(v.literal("note"), v.literal("file"), v.literal("chart"), v.literal("assignment"), v.literal("routine")),
    title: v.string(),
    body: v.string(),
    fileId: v.optional(v.id("_storage")),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    chart: v.optional(v.any()),
    routine: v.optional(v.any()),
    dueDate: v.optional(v.string()),
    done: v.optional(v.boolean()),
    doneAt: v.optional(v.number()),
    /** On an assignment: what the student hands in (core `lessonFiles.ts`'s `SubmitConfig`). */
    submit: v.optional(v.object({ file: v.boolean(), text: v.boolean(), link: v.boolean(), fileKinds: v.array(v.string()), extensions: v.array(v.string()) })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_session", ["sessionId"]),

  /** One lesson with a student (`lessonId` is the teacher–student pair): a date and title, holding
      its notes, assignments, files and charts. Made by the teacher, or automatically when a lesson
      is booked (`bookingId`) — those stay hidden from the student until they start
      (`hiddenUntil`). */
  lessonSessions: defineTable({
    lessonId: v.id("lessonStudents"),
    teacherId: v.id("users"),
    title: v.string(),
    start: v.number(),
    end: v.optional(v.number()),
    bookingId: v.optional(v.id("lessonBookings")),
    /** The student sees it from this time on (missing = straight away). */
    hiddenUntil: v.optional(v.number()),
    cancelled: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_lesson", ["lessonId"])
    .index("by_booking", ["bookingId"]),

  /** A student's hand-in for an assignment (one per assignment; handing in again replaces it):
      text, links and files, then the teacher's feedback — `reviewed`, or `changes` (asked to
      redo it). */
  lessonSubmissions: defineTable({
    itemId: v.id("lessonItems"),
    lessonId: v.id("lessonStudents"),
    teacherId: v.id("users"),
    studentId: v.id("users"),
    text: v.string(),
    links: v.array(v.string()),
    files: v.array(v.object({ fileId: v.id("_storage"), name: v.string(), type: v.string(), size: v.number() })),
    status: v.union(v.literal("submitted"), v.literal("reviewed"), v.literal("changes")),
    feedback: v.optional(v.string()),
    reviewedAt: v.optional(v.number()),
    submittedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_item", ["itemId"])
    .index("by_lesson", ["lessonId"]),

  /** Which parts of Lessons a teacher uses (core `lessonFiles.ts`'s `LessonFeatures`). */
  lessonPrefs: defineTable({
    teacherId: v.id("users"),
    features: v.object({ scheduling: v.boolean(), notes: v.boolean(), files: v.boolean(), charts: v.boolean(), assignments: v.boolean(), routines: v.boolean() }),
    updatedAt: v.number(),
  }).index("by_teacher", ["teacherId"]),

  /** A teacher's usual teaching times (weekly windows in their own time zone) and booking rules —
      what students can request lessons from (`lessonSchedule.ts`, core `lessonSchedule.ts`). */
  lessonAvailability: defineTable({
    teacherId: v.id("users"),
    timeZone: v.string(),
    windows: v.array(v.object({ weekday: v.number(), start: v.string(), end: v.string() })),
    lengthMin: v.number(),
    bufferMin: v.number(),
    noticeHours: v.number(),
    aheadDays: v.number(),
    blockedDates: v.array(v.string()),
    allowRequests: v.boolean(),
    updatedAt: v.number(),
  }).index("by_teacher", ["teacherId"]),

  /** One lesson time with a student: asked for by the student (`requested`, until the teacher
      accepts or declines) or booked (`confirmed` — from an offer, or an accepted request), then
      maybe `cancelled`. `sequence` goes up on each change (for the calendar invite). */
  lessonBookings: defineTable({
    teacherId: v.id("users"),
    lessonId: v.id("lessonStudents"),
    start: v.number(),
    end: v.number(),
    status: v.union(v.literal("requested"), v.literal("confirmed"), v.literal("declined"), v.literal("cancelled")),
    source: v.union(v.literal("request"), v.literal("offer")),
    offerId: v.optional(v.id("lessonOffers")),
    /** The student's note with a request, and the teacher's reply / reason. */
    note: v.optional(v.string()),
    reply: v.optional(v.string()),
    /** The time zone the student booked from (their emails use it). */
    studentTz: v.optional(v.string()),
    /** Where the student's emails go when they have no account linked yet. */
    studentEmail: v.optional(v.string()),
    cancelledBy: v.optional(v.union(v.literal("teacher"), v.literal("student"))),
    sequence: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_teacher_start", ["teacherId", "start"])
    .index("by_lesson", ["lessonId"]),

  /** Times a teacher offered a student by email: the student opens `/lessons/book?offer=<token>`
      (no sign-in needed) and picks one, which books it. */
  lessonOffers: defineTable({
    teacherId: v.id("users"),
    lessonId: v.id("lessonStudents"),
    token: v.string(),
    slots: v.array(v.object({ start: v.number(), end: v.number() })),
    message: v.string(),
    email: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("booked"), v.literal("withdrawn")),
    bookingId: v.optional(v.id("lessonBookings")),
    sentAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_lesson", ["lessonId"]),

  /** What people send through "Send feedback": a bug, an idea, something else, or a report of a
      post / profile (`target`). Only the admin reads these (`admin.ts`); the sender sees their own
      on /feedback. */
  // Anonymous usage counts (usage.ts): totals per UTC day, per kind ("visit" | "view" | "play" |
  // "time") and key (a page path, a tool's href, or "account"/"guest" for visits). No user ids.
  usageDaily: defineTable({
    day: v.string(),
    kind: v.string(),
    key: v.string(),
    n: v.number(),
    ms: v.number(),
  })
    .index("by_day_kind_key", ["day", "kind", "key"])
    .index("by_day", ["day"]),

  // The site's mayday switches (lib/site.ts), one row with key "site".
  siteFlags: defineTable({
    key: v.string(),
    flags: v.any(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_key", ["key"]),

  // Admin corrections to the changelog (apps/web/lib/changelog.ts): one row per version, whose
  // `release` replaces that version's entry on /changelog. `base` is the file's entry when the
  // correction was made, so the admin panel can say when it has changed since.
  changelogEdits: defineTable({
    version: v.string(),
    release: v.any(),
    hidden: v.boolean(),
    base: v.string(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.id("users")),
  }).index("by_version", ["version"]),

  // Extra admins the owner (admin.ts's OWNER_EMAIL) has made. The owner is never in here.
  admins: defineTable({
    userId: v.id("users"),
    grantedBy: v.id("users"),
    grantedAt: v.number(),
  }).index("by_user", ["userId"]),

  feedback: defineTable({
    userId: v.optional(v.id("users")),
    email: v.optional(v.string()),
    kind: v.union(v.literal("bug"), v.literal("feature"), v.literal("other"), v.literal("report")),
    message: v.string(),
    page: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    /** The site's version when it was sent ("0.9.6 beta"). */
    version: v.optional(v.string()),
    screenshotId: v.optional(v.id("_storage")),
    target: v.optional(v.object({ type: v.union(v.literal("post"), v.literal("profile")), id: v.string(), label: v.string() })),
    status: v.union(v.literal("new"), v.literal("seen"), v.literal("planned"), v.literal("done"), v.literal("closed")),
    adminNote: v.optional(v.string()),
    /** The GitHub issue for it, if one was made or linked (by the admin, never automatically). */
    issue: v.optional(v.object({ number: v.number(), url: v.string(), title: v.string(), state: v.string() })),
    /** Sent from another deployment (dev, a preview) to this one, the shared inbox: where from,
        and who sent it there (their account isn't in this database). */
    source: v.optional(v.string()),
    sender: v.optional(v.object({ username: v.optional(v.string()), name: v.optional(v.string()) })),
    /** Here, on a deployment that sends its feedback to the shared inbox: it's been sent. */
    forwarded: v.optional(v.boolean()),
    /** Its ID, shown as FB-<number> (1, 2, 3… in the order they came in). */
    number: v.optional(v.number()),
    /** Commits and pull requests that work on it — added on the admin page, or by the GitHub
        webhook when a commit message or PR mentions FB-<number>. */
    links: v.optional(
      v.array(
        v.object({
          kind: v.union(v.literal("commit"), v.literal("pr")),
          ref: v.string(),
          url: v.string(),
          title: v.string(),
          merged: v.optional(v.boolean()),
          /** A PR's last known state: "open", "closed" or "merged". */
          state: v.optional(v.string()),
          at: v.number(),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_user", ["userId"])
    .index("by_number", ["number"]),

  recordings: defineTable({
    userId: v.id("users"),
    /** In Convex file storage, or (`device`) only on the device that recorded it. */
    storageId: v.optional(v.id("_storage")),
    device: v.optional(onDevice),
    /** It's in a Shed Note or lesson notes, so it stays online (others see it there). */
    keepOnline: v.optional(v.boolean()),
    /** Size in bytes, for one kept on a device (the cloud's own size is read from `_storage`). */
    size: v.optional(v.number()),
    name: v.string(),
    notes: v.string(),
    durationSec: v.number(),
    mimeType: v.string(),
    tuneId: v.optional(v.string()),
    /** How it plays back over its tune's song (`tuneSongs`): each side's volume (0..1) and where
        in the song the take starts, in seconds (negative = the take starts before the song). */
    mix: v.optional(v.object({ songVolume: v.number(), takeVolume: v.number(), offsetSec: v.number() })),
    /** The Shed Log day it belongs to (YYYY-MM-DD, the recorder's local day), and optionally
        the routine on that day — routines live in the `jam-practice-practice-log` synced blob,
        so this is a plain string id like `tuneId`. */
    logDate: v.optional(v.string()),
    routineId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_tune", ["userId", "tuneId"])
    .index("by_user_logDate", ["userId", "logDate"])
    .index("by_user_routine", ["userId", "routineId"]),

  /** A tune's song — an audio file of the actual recording, uploaded by the owner to play
      behind their takes of that tune (and along with them while recording). One per tune; the
      file lives in Convex file storage or on a device, like `files`. `tuneId` is a plain string, same as `recordings`. */
  tuneSongs: defineTable({
    userId: v.id("users"),
    tuneId: v.string(),
    /** In Convex file storage, or (`device`) only on the device that added it. */
    storageId: v.optional(v.id("_storage")),
    device: v.optional(onDevice),
    keepOnline: v.optional(v.boolean()),
    size: v.optional(v.number()),
    name: v.string(),
    mimeType: v.string(),
    durationSec: v.number(),
    createdAt: v.number(),
  }).index("by_user_tune", ["userId", "tuneId"]),

  /** Files the owner uploaded (PDFs, images, audio, video, documents…) — the Files page, and a
      tune's Files section. `tuneId` (a plain string, like `recordings`) attaches one to a tune; a
      file without one is just in the account. Private to the owner, except that a tune shared by
      link (`sharedTunes`) shows its attached files. The file lives in Convex file storage (storage
      plans), or only on the device that added it (free accounts). */
  files: defineTable({
    userId: v.id("users"),
    /** In Convex file storage, or (`device`) only on the device that added it. */
    storageId: v.optional(v.id("_storage")),
    device: v.optional(onDevice),
    /** Pasted into (or picked for) a Shed Note or lesson notes: stays online, since everyone who
        can open the note sees it. */
    keepOnline: v.optional(v.boolean()),
    name: v.string(),
    mimeType: v.string(),
    size: v.number(),
    tuneId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_tune", ["userId", "tuneId"]),

  /** A tune shared by link (`/tune/<id>`): the link shows the tune as it is now (read from the
      owner's synced tune lists), its chord chart, attached files and recordings — never its notes.
      `snapshot` (a `PublicTune` without notes) is only shown if the tune has since been deleted.
      One row per (owner, tune); deleting the row stops the link working. */
  /** A file shared by link (`/file/<id>`): any item on the Files page except profile images,
      named by its kind and id as `files.storage` lists them (`kind` is a `StoredKind`). The file
      itself isn't copied — the link shows it as it is now, and stops working when it's deleted or
      this row is. One row per (owner, item). */
  sharedFiles: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    itemId: v.string(),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_item", ["userId", "kind", "itemId"]),

  sharedTunes: defineTable({
    userId: v.id("users"),
    tuneId: v.string(),
    snapshot: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_tune", ["userId", "tuneId"]),

  /** Bass Genius's bass players (the "Bass players" tab) — a name to file transcriptions under.
      Later Bass Genius will learn each player's style from their transcriptions. */
  bassPlayers: defineTable({
    userId: v.id("users"),
    name: v.string(),
    description: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** One transcription per row (a whole tune can be a few hundred KB, so never all in one
      document). `data` is `packages/core/bassTranscription.ts`'s `Transcription`; `title` and
      `measureCount` are copied out so lists don't need it. */
  bassTranscriptions: defineTable({
    userId: v.id("users"),
    playerId: v.id("bassPlayers"),
    title: v.string(),
    measureCount: v.number(),
    data: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_player", ["playerId"]),

  /** Score Writer: one score per row (`data` is `packages/core/bassTranscription.ts`'s
      `Transcription`, the shared notation format). `title` and `measureCount` are copied out for
      lists. Shed Notes embeds them by id. */
  scores: defineTable({
    userId: v.id("users"),
    title: v.string(),
    measureCount: v.number(),
    data: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  /** Shed Notes: one markdown note per row, private to its owner. `titleKey` is the lowercased
      title (titles are unique per account, and `[[links]]` find notes by it); `links` holds the
      title keys this note's `[[links]]` point at, so backlinks are a lookup; `tags` its #tags. */
  shedNotes: defineTable({
    userId: v.id("users"),
    title: v.string(),
    titleKey: v.string(),
    folder: v.string(),
    body: v.string(),
    links: v.array(v.string()),
    tags: v.array(v.string()),
    /** How this note is shown: full width (else your general setting), and its font (an id from
        the web app's FONTS; missing = the site's font). */
    view: v.optional(v.object({ fullWidth: v.optional(v.boolean()), font: v.optional(v.string()) })),
    /** Sharing by link: `token` is in the link; "invited" = only people it's shared with (signed
        in), "anyone" = anyone with the link can view. Missing = no link. */
    link: v.optional(v.object({ token: v.string(), access: v.union(v.literal("invited"), v.literal("anyone")) })),
    /** Whoever can open this note (shared with them, or its link) can also open every note it
        leads to through links: the notes it links to, theirs, and so on. */
    shareLinked: v.optional(v.boolean()),
    /** How far `shareLinked` goes: "one" = only the notes it links to; missing = all the way down. */
    shareDepth: v.optional(v.literal("one")),
    /** The template it was made from (or last had applied), if any. */
    templateId: v.optional(v.id("shedNoteTemplates")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_title", ["userId", "titleKey"])
    .index("by_link_token", ["link.token"])
    .searchIndex("search_body", { searchField: "body", filterFields: ["userId"] }),

  /** A Shed Note shared with another account: read ("Can view") or write ("Can edit"). */
  shedNoteShares: defineTable({
    noteId: v.id("shedNotes"),
    ownerId: v.id("users"),
    userId: v.id("users"),
    role: v.union(v.literal("read"), v.literal("write")),
    createdAt: v.number(),
  })
    .index("by_note", ["noteId"])
    .index("by_user", ["userId"])
    .index("by_owner", ["ownerId"]),

  /** Shed Notes folders that exist on their own (so a folder can be empty). A note's `folder`
      also makes its folders exist; this table holds the ones made with New folder. */
  /** Shed Notes templates: not notes themselves. `title` and `body` can hold {{variables}}, asked
      for when a note is made from the template. */
  shedNoteTemplates: defineTable({
    userId: v.id("users"),
    name: v.string(),
    /** The new note's title, with {{variables}}; empty = ask for a title. */
    title: v.string(),
    body: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  shedNoteFolders: defineTable({
    userId: v.id("users"),
    path: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),

  /** A Shed Note attached to something outside Shed Notes: a day, a routine on a day, or a tune
      (`target` from `packages/core/shedNotes.ts`'s `targetKey`). `label` is what it was called
      when linked, shown if the thing itself is gone. */
  shedNoteLinks: defineTable({
    userId: v.id("users"),
    noteId: v.id("shedNotes"),
    target: v.string(),
    label: v.string(),
    createdAt: v.number(),
  })
    .index("by_user_target", ["userId", "target"])
    .index("by_note", ["noteId"]),
});
