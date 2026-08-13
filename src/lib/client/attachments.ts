"use client";

import { ocrImage, ocrPdf, releaseOcr } from "@/lib/ocr";
import type { Attachment } from "@/lib/types";

export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const MAX_FILES = 5;

export const ACCEPT_ATTR = [
  ".pdf", ".docx", ".doc", ".xlsx", ".xls", ".csv", ".pptx",
  ".odt", ".ods", ".odp", ".rtf",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp",
  ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".log",
  ".html", ".htm", ".css", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".java", ".c", ".cpp", ".cs", ".go", ".rb", ".php", ".sql", ".sh",
].join(",");

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

type Progress = (message: string | null) => void;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Berkas gagal dibaca."));
    reader.readAsDataURL(file);
  });
}

async function extractOnServer(files: File[]): Promise<Attachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  const res = await fetch("/api/upload", { method: "POST", body: form });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Berkas gagal diproses.");
  }
  const data = (await res.json()) as { attachments: Attachment[] };
  return data.attachments ?? [];
}

/**
 * Proses berkas sebelum dikirim ke percakapan.
 *
 * Gambar dan PDF hasil pindaian dibaca dengan OCR di peramban pengguna lebih
 * dulu; berkas berformat dokumen diekstraksi di server karena butuh pustaka
 * pembaca formatnya.
 */
export async function processFiles(
  input: File[],
  onProgress: Progress,
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  const files = input.slice(0, MAX_FILES);
  const errors: string[] = [];
  const attachments: Attachment[] = [];
  const serverFiles: File[] = [];
  const scannedPdfs: File[] = [];

  const oversized = files.filter((f) => f.size > MAX_FILE_BYTES);
  for (const file of oversized) {
    errors.push(`${file.name}: ukuran melebihi 12 MB.`);
  }

  const usable = files.filter((f) => f.size <= MAX_FILE_BYTES);
  const images = usable.filter((f) => IMAGE_EXTENSIONS.includes(extensionOf(f.name)));
  const documents = usable.filter((f) => !IMAGE_EXTENSIONS.includes(extensionOf(f.name)));

  try {
    // Gambar: OCR lokal, lalu gambarnya tetap ikut supaya bisa ditelaah utuh.
    for (const file of images) {
      onProgress(`Membaca ${file.name} di perangkat…`);
      const dataUrl = await readAsDataUrl(file);
      attachments.push({
        kind: "image",
        name: file.name,
        bytes: file.size,
        dataUrl,
      });

      try {
        const text = await ocrImage(file, ({ phase, ratio }) => {
          onProgress(`${phase} ${file.name} — ${Math.round(ratio * 100)}%`);
        });
        if (text.trim()) {
          attachments.push({
            kind: "text",
            name: `${file.name} (teks hasil OCR)`,
            bytes: text.length,
            text,
            note: "Teks dibaca dengan OCR di perangkat pengguna.",
          });
        }
      } catch (err) {
        console.warn("[ocr] gambar gagal dibaca", err);
      }
    }

    if (documents.length) {
      onProgress(
        documents.length === 1
          ? `Membaca ${documents[0]!.name}…`
          : `Membaca ${documents.length} berkas…`,
      );
      serverFiles.push(...documents);
      const results = await extractOnServer(serverFiles);

      for (const result of results) {
        // PDF pindaian tidak punya lapisan teks — jatuhkan ke OCR lokal.
        const original = documents.find((f) => f.name === result.name);
        const isScannedPdf =
          result.kind === "error" &&
          extensionOf(result.name) === "pdf" &&
          Boolean(original);

        if (isScannedPdf && original) {
          scannedPdfs.push(original);
          continue;
        }
        attachments.push(result);
      }
    }

    for (const file of scannedPdfs) {
      onProgress(`Memindai ${file.name} di perangkat…`);
      try {
        const result = await ocrPdf(file, ({ phase }) => {
          onProgress(`${phase} — ${file.name}`);
        });
        if (result.text.trim()) {
          attachments.push({
            kind: "text",
            name: `${file.name} (teks hasil OCR)`,
            bytes: result.text.length,
            text: result.text,
            note: result.truncated
              ? `OCR dijalankan di perangkat untuk ${result.pages} halaman pertama.`
              : "Teks dibaca dengan OCR di perangkat pengguna.",
          });
        } else {
          errors.push(`${file.name}: isi PDF tidak terbaca meski sudah di-OCR.`);
        }
      } catch (err) {
        console.warn("[ocr] pdf gagal dibaca", err);
        errors.push(`${file.name}: OCR gagal dijalankan di peramban ini.`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Berkas gagal diproses.");
  } finally {
    onProgress(null);
    if (images.length || scannedPdfs.length) void releaseOcr();
  }

  for (const attachment of attachments) {
    if (attachment.kind === "error") {
      errors.push(`${attachment.name}: ${attachment.message}`);
    }
  }

  return {
    attachments: attachments.filter((a) => a.kind !== "error"),
    errors,
  };
}
