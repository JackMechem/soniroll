"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import { TrashIcon } from "@/components/tools";

const AVATAR_SIZE = 400;
const JPEG_QUALITY = 0.85;

/** Loads `file` into an `<img>`, center-crops it to a square, and resizes to `AVATAR_SIZE`px —
    all client-side via a plain `<canvas>` (no new dependency, same reasoning as this app's
    existing "reach for the platform first" habit) — before it's ever uploaded, so a huge photo
    straight off a phone camera doesn't turn into a multi-megabyte upload for a small round
    picture. Rejects anything that isn't actually a loadable image (a non-image file picked by
    mistake, a corrupt one, ...) by rejecting the promise instead of silently producing garbage. */
function resizeToSquareJpeg(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Couldn't process that image."));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that image."))),
        "image/jpeg",
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That doesn't look like a valid image file."));
    };
    img.src = url;
  });
}

/** The profile picture picker in the Public Profile editor — preview, upload (crop/resize
    client-side, then the standard two-step Convex file-upload flow: a one-time URL from
    `generateAvatarUploadUrl`, POST the resized image to it, hand the resulting `storageId` to
    `setAvatar`), and remove. `avatarUrl` is passed in (from `api.profiles.getMine`) rather than
    queried again here, so the editor's one query stays the single source of truth and this
    component just reflects it. */
export default function AvatarUpload({ avatarUrl }: { avatarUrl: string | null }) {
  const generateUploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.profiles.setAvatar);
  const removeAvatar = useMutation(api.profiles.removeAvatar);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the exact same file again re-trigger onChange
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const resized = await resizeToSquareJpeg(file);
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": "image/jpeg" },
        body: resized,
      });
      if (!res.ok) throw new Error("Upload failed.");
      const { storageId } = await res.json();
      await setAvatar({ storageId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that picture.");
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    setError(null);
    setUploading(true);
    try {
      await removeAvatar();
    } catch {
      setError("Couldn't remove your picture.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar url={avatarUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => void onFileChosen(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-9 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
          >
            {avatarUrl ? "Change picture" : "Upload picture"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              onClick={() => void onRemove()}
              disabled={uploading}
              aria-label="Remove picture"
              title="Remove picture"
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-hover hover:text-danger disabled:opacity-50"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
          {uploading && <LoadingSpinner size="sm" inline />}
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </div>
  );
}
