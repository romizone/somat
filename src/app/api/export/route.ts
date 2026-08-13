import { DOC_META, buildDocument } from "@/lib/docgen";
import { clientIp, checkUploadQuota } from "@/lib/ratelimit";
import type { DocFormat } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const FORMATS: DocFormat[] = ["docx", "xlsx", "pptx", "pdf"];
const MAX_MARKDOWN = 400_000;

export async function POST(req: Request) {
  const quota = await checkUploadQuota(clientIp(req));
  if (!quota.ok) return Response.json({ error: quota.message }, { status: 429 });

  let body: { format?: string; title?: string; filename?: string; markdown?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  const format = FORMATS.includes(body.format as DocFormat)
    ? (body.format as DocFormat)
    : null;
  if (!format) {
    return Response.json({ error: "Format berkas tidak dikenali." }, { status: 400 });
  }

  const markdown = (body.markdown ?? "").slice(0, MAX_MARKDOWN);
  if (!markdown.trim()) {
    return Response.json({ error: "Isi dokumen kosong." }, { status: 400 });
  }

  const title = (body.title ?? "Dokumen").slice(0, 200) || "Dokumen";
  const meta = DOC_META[format];
  const base =
    (body.filename ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "dokumen";

  try {
    const file = await buildDocument(format, title, markdown);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": meta.mime,
        "Content-Disposition": `attachment; filename="${base}.${meta.extension}"`,
        "Content-Length": String(file.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[export] gagal membuat", format, err);
    return Response.json(
      { error: "Berkas gagal dibuat. Coba lagi atau ubah isinya." },
      { status: 500 },
    );
  }
}
