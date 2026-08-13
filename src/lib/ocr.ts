"use client";

/**
 * OCR dijalankan di perangkat pengguna (WebAssembly), bukan di server.
 * Gambar dan PDF hasil pindaian dibaca dulu di browser, lalu yang dikirim
 * hanyalah teks hasil bacaannya.
 */

const LANGS = "ind+eng";
/** PDF pindaian dibatasi supaya browser tidak terkunci terlalu lama. */
const MAX_PDF_PAGES = 12;
const RENDER_SCALE = 2;

type Progress = (info: { phase: string; ratio: number }) => void;

type TesseractWorker = {
  recognize(image: unknown): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
};

let workerPromise: Promise<TesseractWorker> | null = null;

async function getWorker(onProgress?: Progress): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      return (await createWorker(LANGS, 1, {
        logger: (message: { status?: string; progress?: number }) => {
          if (!onProgress) return;
          if (message.status === "recognizing text") {
            onProgress({ phase: "Membaca teks", ratio: message.progress ?? 0 });
          }
        },
      })) as unknown as TesseractWorker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Lepaskan worker OCR setelah selesai supaya memori browser kembali bebas. */
export async function releaseOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Worker sudah mati; tidak ada yang perlu dibereskan.
  }
}

function clean(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Baca teks dari satu berkas gambar. */
export async function ocrImage(
  file: Blob,
  onProgress?: Progress,
): Promise<string> {
  const worker = await getWorker(onProgress);
  const result = await worker.recognize(file);
  return clean(result.data.text ?? "");
}

/** Render tiap halaman PDF ke kanvas lalu baca teksnya dengan OCR. */
export async function ocrPdf(
  file: File,
  onProgress?: Progress,
): Promise<{ text: string; pages: number; truncated: boolean }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const total = document.numPages;
  const pages = Math.min(total, MAX_PDF_PAGES);
  const worker = await getWorker();
  const parts: string[] = [];

  try {
    for (let index = 1; index <= pages; index += 1) {
      onProgress?.({
        phase: `Memindai halaman ${index}/${pages}`,
        ratio: (index - 1) / pages,
      });

      const page = await document.getPage(index);
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Kanvas tidak tersedia di peramban ini.");

      await page.render({
        canvas,
        canvasContext: context,
        viewport,
      }).promise;

      const result = await worker.recognize(canvas);
      const text = clean(result.data.text ?? "");
      if (text) parts.push(`--- Halaman ${index} ---\n${text}`);

      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return {
    text: parts.join("\n\n"),
    pages,
    truncated: total > pages,
  };
}
