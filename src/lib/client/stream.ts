"use client";

import type { StreamEvent } from "@/lib/types";

/** Baca aliran SSE dari /api/chat menjadi kejadian yang siap dipakai UI. */
export async function* readStream(
  response: Response,
): AsyncGenerator<StreamEvent> {
  if (!response.body) return;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (!raw.startsWith("data:")) continue;
        try {
          yield JSON.parse(raw.slice(5).trim()) as StreamEvent;
        } catch {
          // Potongan yang belum utuh diabaikan.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}
