// Salin worker pdf.js ke public/ supaya OCR PDF di browser tidak bergantung
// pada resolusi modul saat runtime (aman untuk build Vercel maupun lokal).
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

async function main() {
  let entry;
  try {
    entry = require.resolve("pdfjs-dist/package.json");
  } catch {
    console.warn("[assets] pdfjs-dist belum terpasang, worker dilewati.");
    return;
  }

  const root = dirname(entry);
  const source = join(root, "build", "pdf.worker.min.mjs");
  const targetDir = join(process.cwd(), "public");
  await mkdir(targetDir, { recursive: true });
  await copyFile(source, join(targetDir, "pdf.worker.min.mjs"));
  console.log("[assets] worker pdf.js disalin ke public/pdf.worker.min.mjs");
}

main().catch((err) => {
  console.error("[assets] gagal menyalin worker pdf.js:", err.message);
  process.exitCode = 1;
});
