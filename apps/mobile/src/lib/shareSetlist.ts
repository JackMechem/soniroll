import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { toPublicTune } from '@jam-practice/core/profileTunes';
import type { Tune } from '@jam-practice/core/types';
import { useMutation } from 'convex/react';
import { Share } from 'react-native';

import type { Setlist } from '@/lib/useSetlists';

/** Where a shared setlist's link points — the website's setlist page. */
export const SETLIST_SHARE_BASE = 'https://www.soniroll.com/setlist/';

/**
 * Share a setlist by link, then open the phone's share sheet with it. The link always shows the
 * setlist as it is now (the server reads it live — `setlists.getShared`), so editing the setlist
 * never needs a re-share. Returns the share id for the caller to remember on the setlist.
 */
export function useShareSetlist() {
  const shareMutation = useMutation(api.setlists.share);
  const unshareMutation = useMutation(api.setlists.unshare);

  async function share(setlist: Setlist, tunes: Tune[]): Promise<string> {
    const id = await shareMutation({
      shareId: setlist.shareId as Id<'sharedSetlists'> | undefined,
      setlistId: setlist.id,
      title: setlist.name,
      description: setlist.description,
      tunes: tunes.map(toPublicTune),
    });
    const url = SETLIST_SHARE_BASE + id;
    await Share.share({ message: `${setlist.name} — ${url}`, url, title: setlist.name });
    return id;
  }

  async function unshare(shareId: string) {
    await unshareMutation({ shareId: shareId as Id<'sharedSetlists'> });
  }

  return { share, unshare };
}
