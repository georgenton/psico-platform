"use client";

import type { ImageBlockInfo } from "@psico/types";

/**
 * An illustration inside a chapter.
 *
 * A plain `<img>`, not `next/image`. Optimisation here would mean adding the
 * storage host to `images.remotePatterns` — widening what the whole app will
 * proxy and render, for a handful of editorial figures. `loading="lazy"` and
 * intrinsic sizing get most of the benefit with none of that.
 *
 * `alt` is guaranteed non-empty by `imageBlockInfo`, which returns null without
 * it. That is deliberate: a decorative image would take `alt=""`, but an author
 * putting a diagram in a psychoeducation chapter is not decorating.
 */
export function ImageBlock({
  info,
  blockId,
}: {
  info: ImageBlockInfo;
  blockId: string;
}) {
  return (
    <figure
      data-block-id={blockId}
      data-block-kind="IMAGE"
      className="reader-block reader-block-image my-7"
    >
      <img
        src={info.imageUrl}
        alt={info.alt}
        loading="lazy"
        className="h-auto w-full max-w-full rounded-xl"
        style={{ background: "var(--color-warm-100)" }}
      />
      {(info.caption || info.credit) && (
        <figcaption
          className="mt-2 text-[13px] leading-[1.5]"
          style={{ color: "var(--color-warm-600)" }}
        >
          {info.caption}
          {info.caption && info.credit && " · "}
          {info.credit && (
            <span style={{ color: "var(--color-warm-500)" }}>
              {info.credit}
            </span>
          )}
        </figcaption>
      )}
    </figure>
  );
}
