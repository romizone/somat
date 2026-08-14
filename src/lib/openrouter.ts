import {
  IMAGE_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL,
  SITE_NAME,
  SITE_URL,
} from "@/lib/config";

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": SITE_URL,
    "X-Title": SITE_NAME,
  };
}

/**
 * Pesan kesalahan dari penyedia sering menyebut nama model. Situs ini menyembunyikan
 * detail itu dari pengguna, jadi kesalahan diterjemahkan ke bahasa yang netral.
 */
export function friendlyError(status: number): string {
  if (status === 401 || status === 403)
    return "Layanan sedang tidak dapat diakses. Hubungi pengelola situs.";
  if (status === 402)
    return "Kuota layanan sedang habis. Silakan coba lagi nanti.";
  if (status === 429)
    return "Layanan sedang sibuk. Tunggu sebentar lalu coba lagi.";
  if (status === 408 || status === 504)
    return "Permintaan terlalu lama diproses. Coba lagi dengan permintaan yang lebih ringkas.";
  return "Terjadi gangguan saat memproses permintaan. Coba lagi sebentar lagi.";
}

export type ChatRole = "system" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type UpstreamMessage = {
  role: ChatRole;
  content?: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/** Panggil endpoint chat completions dengan streaming SSE. */
export async function streamChat(body: {
  model: string;
  messages: UpstreamMessage[];
  tools?: ToolDef[];
  max_tokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}): Promise<Response> {
  const { signal, ...payload } = body;
  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ ...payload, stream: true }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    console.error("[openrouter] chat gagal", res.status, detail.slice(0, 500));
    throw new UpstreamError(friendlyError(res.status), res.status);
  }
  return res;
}

/** Pecah aliran SSE menjadi objek JSON per event. */
export async function* readSse(
  res: Response,
): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let index: number;
      while ((index = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line || line.startsWith(":")) continue;
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          // Potongan JSON yang rusak diabaikan; aliran berikutnya tetap jalan.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

export type ImageOptions = {
  prompt: string;
  aspectRatio?: string;
  quality?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

export type ImageResult = { dataUrl: string; cost?: number };

/**
 * Tidak semua model punya tombol kualitas — model Google, misalnya, hanya
 * menerima rasio. Kirim parameter yang memang didukung supaya tidak ditolak.
 */
function supportsQuality(model: string): boolean {
  return model.startsWith("openai/");
}

/** Buat satu gambar lewat Image API OpenRouter. */
export async function generateImage(
  opts: ImageOptions,
): Promise<ImageResult> {
  const payload: Record<string, unknown> = {
    model: IMAGE_MODEL,
    prompt: opts.prompt,
    n: 1,
    aspect_ratio: opts.aspectRatio ?? "1:1",
  };
  if (supportsQuality(IMAGE_MODEL)) {
    payload.quality = opts.quality ?? "medium";
  }

  const res = await fetch(`${OPENROUTER_BASE_URL}/images`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
    signal: opts.signal,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[openrouter] gambar gagal", res.status, detail.slice(0, 500));
    throw new UpstreamError(friendlyError(res.status), res.status);
  }

  const json = (await res.json()) as {
    data?: Array<{ b64_json?: string; media_type?: string }>;
    usage?: { cost?: number };
  };

  const first = json.data?.[0];
  if (!first?.b64_json) {
    throw new UpstreamError("Gambar gagal dibuat. Coba ubah deskripsinya.", 502);
  }

  return {
    dataUrl: `data:${first.media_type ?? "image/png"};base64,${first.b64_json}`,
    cost: json.usage?.cost,
  };
}
