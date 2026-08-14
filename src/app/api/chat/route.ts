import { LIMITS, OPENROUTER_API_KEY, TEXT_MODEL, VISION_MODEL } from "@/lib/config";
import {
  UpstreamError,
  generateImage,
  readSse,
  streamChat,
  type ContentPart,
  type ToolCall,
  type UpstreamMessage,
} from "@/lib/openrouter";
import { SYSTEM_PROMPT, VISION_HINT } from "@/lib/prompt";
import { ASPECT_RATIOS, TOOLS } from "@/lib/tools";
import { checkChatQuota, checkImageQuota, clientIp } from "@/lib/ratelimit";
import type { Attachment, DocFormat, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_TOOL_ROUNDS = 4;
const DOC_FORMATS: DocFormat[] = ["docx", "xlsx", "pptx", "pdf"];

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
};

/** Ubah satu pesan pengguna menjadi bentuk yang dimengerti model. */
function toUpstream(msg: ClientMessage): UpstreamMessage {
  const text = msg.content.slice(0, LIMITS.maxMessageChars);

  if (msg.role === "assistant") return { role: "assistant", content: text };

  const attachments = msg.attachments ?? [];
  const notes: string[] = [];
  const images: ContentPart[] = [];

  for (const att of attachments) {
    if (att.kind === "text") {
      notes.push(
        `=== Berkas: ${att.name} ===\n${att.text}\n=== Akhir berkas: ${att.name} ===`,
      );
    } else if (att.kind === "image") {
      images.push({ type: "image_url", image_url: { url: att.dataUrl } });
    } else if (att.kind === "error") {
      notes.push(`=== Berkas ${att.name} gagal dibaca: ${att.message} ===`);
    }
  }

  const body = notes.length ? `${notes.join("\n\n")}\n\n${text}` : text;

  if (!images.length) return { role: "user", content: body };
  return {
    role: "user",
    content: [{ type: "text", text: body || VISION_HINT }, ...images],
  };
}

/** Pangkas riwayat dari yang terlama supaya tetap di bawah batas konteks. */
function trimHistory(messages: UpstreamMessage[]): UpstreamMessage[] {
  const sized = messages.map((m) => {
    const content = m.content;
    const size =
      typeof content === "string"
        ? content.length
        : Array.isArray(content)
          ? content.reduce(
              (n, p) => n + (p.type === "text" ? p.text.length : 4000),
              0,
            )
          : 0;
    return { message: m, size };
  });

  let total = sized.reduce((n, s) => n + s.size, 0);
  let start = 0;
  // Pesan terakhir selalu dipertahankan, apa pun ukurannya.
  while (total > LIMITS.maxHistoryChars && start < sized.length - 1) {
    total -= sized[start]!.size;
    start += 1;
  }
  return sized.slice(start).map((s) => s.message);
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function safeFilename(raw: unknown, fallback: string): string {
  const base = String(raw ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || fallback;
}

export async function POST(req: Request) {
  if (!OPENROUTER_API_KEY) {
    return Response.json(
      { error: "Layanan belum dikonfigurasi. Hubungi pengelola situs." },
      { status: 503 },
    );
  }

  let body: { messages?: ClientMessage[] };
  try {
    body = (await req.json()) as { messages?: ClientMessage[] };
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const incoming = Array.isArray(body.messages) ? body.messages : [];
  if (!incoming.length) {
    return Response.json({ error: "Tidak ada pesan yang dikirim." }, { status: 400 });
  }

  const ip = clientIp(req);
  const quota = await checkChatQuota(ip);
  if (!quota.ok) {
    return Response.json({ error: quota.message }, { status: 429 });
  }

  const hasImage = incoming.some((m) =>
    m.attachments?.some((a) => a.kind === "image"),
  );
  const model = hasImage ? VISION_MODEL : TEXT_MODEL;

  const conversation: UpstreamMessage[] = trimHistory(incoming.map(toUpstream));
  const messages: UpstreamMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversation,
  ];

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const runTool = async (call: ToolCall): Promise<string> => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          return "Gagal: argumen alat tidak valid. Perbaiki lalu panggil ulang.";
        }

        if (call.function.name === "buat_gambar") {
          const prompt = String(args.prompt ?? "").trim();
          if (!prompt) return "Gagal: deskripsi gambar kosong.";

          const imageQuota = await checkImageQuota(ip);
          if (!imageQuota.ok) {
            return `Gagal: ${imageQuota.message} Sampaikan hal ini ke pengguna.`;
          }

          const rasioRaw = String(args.rasio ?? "1:1");
          const rasio = (ASPECT_RATIOS as readonly string[]).includes(rasioRaw)
            ? rasioRaw
            : "1:1";
          const kualitasRaw = String(args.kualitas ?? "medium");
          const kualitas = (["low", "medium", "high"] as const).includes(
            kualitasRaw as "low" | "medium" | "high",
          )
            ? (kualitasRaw as "low" | "medium" | "high")
            : "medium";

          send({ type: "status", text: "Menyiapkan gambar…" });
          // Penyedia tidak melaporkan kemajuan, jadi persen diperkirakan dari
          // waktu berjalan terhadap durasi tipikal (~45 detik terukur).
          const EXPECTED_SEC = 45;
          const startedAt = Date.now();
          const progressTimer = setInterval(() => {
            const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
            const percent = Math.min(
              95,
              Math.round(100 * (1 - Math.exp(-elapsedSec / (EXPECTED_SEC / 2)))),
            );
            send({
              type: "progress",
              progress: {
                percent,
                elapsedSec,
                etaSec: Math.max(0, EXPECTED_SEC - elapsedSec),
              },
            });
          }, 1500);
          try {
            const result = await generateImage({
              prompt,
              aspectRatio: rasio,
              quality: kualitas,
              signal: req.signal,
            });
            clearInterval(progressTimer);
            const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
            send({
              type: "progress",
              progress: { percent: 100, elapsedSec, etaSec: 0 },
            });
            send({
              type: "image",
              image: { id: newId(), prompt, dataUrl: result.dataUrl },
            });
            return "Berhasil: gambar sudah dibuat dan sedang ditampilkan ke pengguna lengkap dengan tombol unduh.";
          } catch (err) {
            clearInterval(progressTimer);
            const message =
              err instanceof UpstreamError
                ? err.message
                : "Gambar gagal dibuat.";
            return `Gagal: ${message} Sampaikan hal ini ke pengguna.`;
          }
        }

        if (call.function.name === "buat_dokumen") {
          const formatRaw = String(args.format ?? "").toLowerCase();
          const format = DOC_FORMATS.includes(formatRaw as DocFormat)
            ? (formatRaw as DocFormat)
            : null;
          const markdown = String(args.konten_markdown ?? "").trim();
          const judul = String(args.judul ?? "Dokumen").trim() || "Dokumen";

          if (!format) return "Gagal: format dokumen tidak dikenali.";
          if (!markdown) return "Gagal: isi dokumen kosong.";

          send({ type: "status", text: "Menyusun berkas…" });
          send({
            type: "document",
            doc: {
              id: newId(),
              format,
              filename: safeFilename(args.nama_file, safeFilename(judul, "dokumen")),
              title: judul,
              markdown: markdown.slice(0, 400_000),
            },
          });
          return `Berhasil: berkas ${format.toUpperCase()} sudah dibuat dan tombol unduhnya sudah tampil di layar pengguna.`;
        }

        return "Gagal: alat tidak dikenal.";
      };

      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const upstream = await streamChat({
            model,
            messages,
            tools: TOOLS,
            max_tokens: LIMITS.maxOutputTokens,
            temperature: 0.7,
            signal: req.signal,
          });

          let text = "";
          const calls = new Map<number, ToolCall>();

          for await (const chunk of readSse(upstream)) {
            const choice = (
              chunk as {
                choices?: Array<{
                  delta?: {
                    content?: string | null;
                    tool_calls?: Array<{
                      index?: number;
                      id?: string;
                      function?: { name?: string; arguments?: string };
                    }>;
                  };
                }>;
                error?: { message?: string };
              }
            ).choices?.[0];

            const upstreamError = (chunk as { error?: { message?: string } }).error;
            if (upstreamError) {
              throw new UpstreamError(
                "Layanan sedang sibuk. Tunggu sebentar lalu coba lagi.",
                502,
              );
            }
            if (!choice?.delta) continue;

            const piece = choice.delta.content;
            if (piece) {
              text += piece;
              send({ type: "delta", text: piece });
            }

            for (const partial of choice.delta.tool_calls ?? []) {
              const index = partial.index ?? 0;
              const existing = calls.get(index) ?? {
                id: partial.id ?? `call_${index}`,
                type: "function" as const,
                function: { name: "", arguments: "" },
              };
              if (partial.id) existing.id = partial.id;
              if (partial.function?.name)
                existing.function.name = partial.function.name;
              if (partial.function?.arguments)
                existing.function.arguments += partial.function.arguments;
              calls.set(index, existing);
            }
          }

          if (!calls.size) break;

          const toolCalls = [...calls.values()].filter((c) => c.function.name);
          messages.push({
            role: "assistant",
            content: text || null,
            tool_calls: toolCalls,
          });

          for (const call of toolCalls) {
            const result = await runTool(call);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: call.function.name,
              content: result,
            });
          }
        }

        send({ type: "done" });
      } catch (err) {
        if (req.signal.aborted) {
          // Pengguna menekan berhenti — tidak perlu pesan kesalahan.
        } else {
          console.error("[chat] gagal", err);
          send({
            type: "error",
            message:
              err instanceof UpstreamError
                ? err.message
                : "Terjadi gangguan saat memproses permintaan. Coba lagi sebentar lagi.",
          });
        }
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // Aliran sudah tertutup lebih dulu.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
