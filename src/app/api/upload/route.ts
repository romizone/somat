import { LIMITS } from "@/lib/config";
import {
  ACCEPTED_EXTENSIONS,
  IMAGE_EXTENSIONS,
  extensionOf,
  extractText,
} from "@/lib/extract";
import { checkUploadQuota, clientIp } from "@/lib/ratelimit";
import type { Attachment } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const ip = clientIp(req);
  const quota = await checkUploadQuota(ip);
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Berkas gagal diterima." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) {
    return Response.json({ error: "Tidak ada berkas yang dikirim." }, { status: 400 });
  }
  if (files.length > LIMITS.maxUploadFiles) {
    return Response.json(
      { error: `Maksimal ${LIMITS.maxUploadFiles} berkas sekali unggah.` },
      { status: 400 },
    );
  }

  const attachments: Attachment[] = [];

  for (const file of files) {
    const name = file.name || "berkas";
    const bytes = file.size;

    if (bytes > LIMITS.maxUploadBytes) {
      attachments.push({
        kind: "error",
        name,
        bytes,
        message: `Ukuran berkas melebihi ${Math.round(LIMITS.maxUploadBytes / 1024 / 1024)} MB.`,
      });
      continue;
    }

    const ext = extensionOf(name);
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      attachments.push({
        kind: "error",
        name,
        bytes,
        message: "Jenis berkas ini belum didukung.",
      });
      continue;
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());

      if (IMAGE_EXTENSIONS.includes(ext)) {
        const mime = file.type || `image/${ext === "jpg" ? "jpeg" : ext}`;
        attachments.push({
          kind: "image",
          name,
          bytes,
          dataUrl: `data:${mime};base64,${buffer.toString("base64")}`,
        });
        continue;
      }

      const extracted = await extractText(name, buffer);
      if (!extracted.text) {
        attachments.push({
          kind: "error",
          name,
          bytes,
          message: extracted.note ?? "Isi berkas tidak terbaca.",
        });
        continue;
      }

      attachments.push({
        kind: "text",
        name,
        bytes,
        text: extracted.text,
        note: extracted.note,
      });
    } catch (err) {
      console.error("[upload] gagal memproses", name, err);
      attachments.push({
        kind: "error",
        name,
        bytes,
        message:
          err instanceof Error && err.message
            ? err.message
            : "Berkas gagal diproses.",
      });
    }
  }

  return Response.json({ attachments });
}
