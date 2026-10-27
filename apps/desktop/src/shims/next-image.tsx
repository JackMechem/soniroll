import type { CSSProperties, ImgHTMLAttributes } from "react";

/** Stand-in for `next/image`: a plain <img>. */

type StaticImage = { src: string; width?: number; height?: number };

type ImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | StaticImage;
  fill?: boolean;
  priority?: boolean;
  quality?: number;
  placeholder?: string;
  unoptimized?: boolean;
};

// Next-only props with no <img> equivalent.
const NEXT_ONLY = ["quality", "placeholder", "unoptimized"] as const;

export default function Image({ src, fill, priority, style, alt = "", ...props }: ImageProps) {
  const rest: Record<string, unknown> = { ...props };
  for (const key of NEXT_ONLY) delete rest[key];
  const url = typeof src === "string" ? src : src.src;
  const fillStyle: CSSProperties = fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {};
  return <img src={url} alt={alt} loading={priority ? "eager" : "lazy"} style={{ ...fillStyle, ...style }} {...rest} />;
}
