/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ResendOTP from "../ResendOTP.js";
import type * as ResendPasswordReset from "../ResendPasswordReset.js";
import type * as account from "../account.js";
import type * as admin from "../admin.js";
import type * as adminAnalytics from "../adminAnalytics.js";
import type * as auth from "../auth.js";
import type * as bassPlayers from "../bassPlayers.js";
import type * as billing from "../billing.js";
import type * as changelog from "../changelog.js";
import type * as chordCharts from "../chordCharts.js";
import type * as communityTunes from "../communityTunes.js";
import type * as feedback from "../feedback.js";
import type * as fileFolders from "../fileFolders.js";
import type * as files from "../files.js";
import type * as follows from "../follows.js";
import type * as http from "../http.js";
import type * as inbox from "../inbox.js";
import type * as inboxCore from "../inboxCore.js";
import type * as inboxForward from "../inboxForward.js";
import type * as lessonSchedule from "../lessonSchedule.js";
import type * as lessons from "../lessons.js";
import type * as lib_chordCharts from "../lib/chordCharts.js";
import type * as lib_fileFolders from "../lib/fileFolders.js";
import type * as lib_github from "../lib/github.js";
import type * as lib_polarWebhook from "../lib/polarWebhook.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_routines from "../lib/routines.js";
import type * as lib_setlists from "../lib/setlists.js";
import type * as lib_site from "../lib/site.js";
import type * as lib_storage from "../lib/storage.js";
import type * as lib_tunes from "../lib/tunes.js";
import type * as pdfMarkups from "../pdfMarkups.js";
import type * as practiceSessions from "../practiceSessions.js";
import type * as previewSeed from "../previewSeed.js";
import type * as profiles from "../profiles.js";
import type * as recordings from "../recordings.js";
import type * as routines from "../routines.js";
import type * as scores from "../scores.js";
import type * as setlists from "../setlists.js";
import type * as shedNoteShares from "../shedNoteShares.js";
import type * as shedNoteTemplates from "../shedNoteTemplates.js";
import type * as shedNotes from "../shedNotes.js";
import type * as site from "../site.js";
import type * as syncedSettings from "../syncedSettings.js";
import type * as testAccounts from "../testAccounts.js";
import type * as tuneSongs from "../tuneSongs.js";
import type * as usage from "../usage.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ResendOTP: typeof ResendOTP;
  ResendPasswordReset: typeof ResendPasswordReset;
  account: typeof account;
  admin: typeof admin;
  adminAnalytics: typeof adminAnalytics;
  auth: typeof auth;
  bassPlayers: typeof bassPlayers;
  billing: typeof billing;
  changelog: typeof changelog;
  chordCharts: typeof chordCharts;
  communityTunes: typeof communityTunes;
  feedback: typeof feedback;
  fileFolders: typeof fileFolders;
  files: typeof files;
  follows: typeof follows;
  http: typeof http;
  inbox: typeof inbox;
  inboxCore: typeof inboxCore;
  inboxForward: typeof inboxForward;
  lessonSchedule: typeof lessonSchedule;
  lessons: typeof lessons;
  "lib/chordCharts": typeof lib_chordCharts;
  "lib/fileFolders": typeof lib_fileFolders;
  "lib/github": typeof lib_github;
  "lib/polarWebhook": typeof lib_polarWebhook;
  "lib/resend": typeof lib_resend;
  "lib/roles": typeof lib_roles;
  "lib/routines": typeof lib_routines;
  "lib/setlists": typeof lib_setlists;
  "lib/site": typeof lib_site;
  "lib/storage": typeof lib_storage;
  "lib/tunes": typeof lib_tunes;
  pdfMarkups: typeof pdfMarkups;
  practiceSessions: typeof practiceSessions;
  previewSeed: typeof previewSeed;
  profiles: typeof profiles;
  recordings: typeof recordings;
  routines: typeof routines;
  scores: typeof scores;
  setlists: typeof setlists;
  shedNoteShares: typeof shedNoteShares;
  shedNoteTemplates: typeof shedNoteTemplates;
  shedNotes: typeof shedNotes;
  site: typeof site;
  syncedSettings: typeof syncedSettings;
  testAccounts: typeof testAccounts;
  tuneSongs: typeof tuneSongs;
  usage: typeof usage;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  polar: import("@convex-dev/polar/_generated/component.js").ComponentApi<"polar">;
};
