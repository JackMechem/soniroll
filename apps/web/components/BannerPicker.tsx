"use client";

import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import LoadingSpinner from "@/components/LoadingSpinner";
import ProfileBanner from "@/components/ProfileBanner";
import { CheckIcon, PlusIcon } from "@/components/tools";
import { BANNERS, type BannerValue, DEFAULT_BANNER } from "@/lib/banners";

const W = 1500;
const H = 500;

/** Crops an image to the banner's 3:1 shape (centered) and shrinks it to at most 1500×500 JPEG. */
function resizeBanner(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const ratio = W / H;
      let sw = img.naturalWidth;
      let sh = sw / ratio;
      if (sh > img.naturalHeight) {
        sh = img.naturalHeight;
        sw = sh * ratio;
      }
      const sx = (img.naturalWidth - sw) / 2;
      const sy = (img.naturalHeight - sh) / 2;
      const outW = Math.min(W, Math.round(sw));
      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = Math.round(outW / ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Couldn't read the image."));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read the image."))), "image/jpeg", 0.86);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file isn't an image we can read."));
    };
    img.src = url;
  });
}

/** Account → Profile: the banner on your profile — a built-in design, or your own image. */
export default function BannerPicker({ banner }: { banner: BannerValue }) {
  const generateUploadUrl = useMutation(api.profiles.generateAvatarUploadUrl);
  const setImage = useMutation(api.profiles.setBannerImage);
  const setPreset = useMutation(api.profiles.setBannerPreset);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploaded = !!banner && "url" in banner;
  const current = banner && "preset" in banner ? banner.preset : uploaded ? null : DEFAULT_BANNER;

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const blob = await resizeBanner(file);
      const res = await fetch(await generateUploadUrl(), { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      if (!res.ok) throw new Error("Upload failed — try again.");
      const { storageId } = (await res.json()) as { storageId: string };
      await setImage({ storageId: storageId as Id<"_storage"> });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs font-medium text-muted">Banner</span>
      <div className="relative">
        <ProfileBanner banner={banner} className="h-24 rounded-md sm:h-32" />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md bg-black/30">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {BANNERS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => void setPreset({ preset: b.id })}
            aria-pressed={current === b.id}
            aria-label={b.label}
            title={b.label}
            className={`relative h-10 overflow-hidden rounded-md ring-offset-2 ring-offset-surface transition ${current === b.id ? "ring-2 ring-accent" : "ring-1 ring-foreground/10 hover:ring-foreground/30"}`}
            style={b.style}
          >
            {current === b.id && (
              <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <CheckIcon className="h-3 w-3" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex h-9 items-center gap-1.5 rounded-md bg-foreground/[0.05] px-3 text-sm font-medium hover:bg-surface-hover disabled:opacity-60"
        >
          <PlusIcon className="h-4 w-4" /> {uploaded ? "Upload a different image" : "Upload your own"}
        </button>
        {uploaded && (
          <button type="button" onClick={() => void setPreset({ preset: DEFAULT_BANNER })} className="h-9 rounded-md px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">
            Remove image
          </button>
        )}
        <span className="text-xs text-muted">Wide images work best (3:1). It&apos;s cropped to fit.</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
