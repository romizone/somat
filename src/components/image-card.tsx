"use client";

/* eslint-disable @next/next/no-img-element */

import { Download } from "lucide-react";
import type { GeneratedImage } from "@/lib/types";

export function ImageCard({ image }: { image: GeneratedImage }) {
  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = image.dataUrl;
    anchor.download = `somat-${image.id}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-card">
      <img
        src={image.dataUrl}
        alt={image.prompt}
        className="block max-h-[520px] w-full object-contain bg-tint/40"
        loading="lazy"
      />
      <figcaption className="flex items-start gap-3 border-t border-line p-3">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
          {image.prompt}
        </p>
        <button
          type="button"
          onClick={download}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-primary transition hover:border-interactive hover:text-interactive"
        >
          <Download size={14} />
          Unduh
        </button>
      </figcaption>
    </figure>
  );
}
