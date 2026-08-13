import JSZip from "jszip";
import { LIMITS } from "@/lib/config";

/**
 * Ekstraksi teks dari berkas yang diunggah pengguna. Semua pustaka berat
 * diimpor secara dinamis supaya hanya dimuat saat jenis berkasnya memang dipakai.
 */

export type Extracted = { text: string; truncated: boolean; note?: string };

export const TEXT_LIKE_EXTENSIONS = [
  "txt", "md", "markdown", "csv", "tsv", "json", "xml", "yaml", "yml", "log",
  "html", "htm", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "h", "cpp",
  "cs", "go", "rb", "php", "sql", "sh", "bat", "ini", "conf", "env", "rtf",
];

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];

export const DOCUMENT_EXTENSIONS = [
  "pdf", "docx", "doc", "xlsx", "xls", "pptx", "odt", "ods", "odp",
];

export const ACCEPTED_EXTENSIONS = [
  ...DOCUMENT_EXTENSIONS,
  ...IMAGE_EXTENSIONS,
  ...TEXT_LIKE_EXTENSIONS,
];

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function cap(text: string): Extracted {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  if (clean.length <= LIMITS.maxExtractedChars) {
    return { text: clean, truncated: false };
  }
  return {
    text: clean.slice(0, LIMITS.maxExtractedChars),
    truncated: true,
    note: "Isi berkas dipotong karena terlalu panjang.",
  };
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]{2,}/g, " ");
}

/** Ambil teks dari XML Office/OpenDocument tanpa mem-parse skema penuh. */
function xmlText(xml: string, breakOn: RegExp): string {
  return xml
    .replace(breakOn, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]{2,}/g, " ");
}

async function fromPdf(buffer: Buffer): Promise<Extracted> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  let text = "";
  try {
    const result = await parser.getText();
    text = (result?.text ?? "").trim();
  } finally {
    await parser.destroy().catch(() => {});
  }

  if (!text) {
    return {
      text: "",
      truncated: false,
      note: "PDF ini sepertinya hasil pindaian tanpa lapisan teks, jadi isinya tidak terbaca.",
    };
  }
  return cap(text);
}

async function fromDocx(buffer: Buffer): Promise<Extracted> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  return cap(result.value ?? "");
}

async function fromLegacyDoc(buffer: Buffer): Promise<Extracted> {
  const mod = await import("word-extractor");
  const WordExtractor = (mod.default ?? mod) as new () => {
    extract(input: Buffer): Promise<{ getBody(): string }>;
  };
  const doc = await new WordExtractor().extract(buffer);
  return cap(doc.getBody() ?? "");
}

async function fromSpreadsheet(buffer: Buffer): Promise<Extracted> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) parts.push(`--- Lembar: ${name} ---\n${csv.trim()}`);
  }
  return cap(parts.join("\n\n"));
}

async function fromPptx(buffer: Buffer): Promise<Extracted> {
  const zip = await JSZip.loadAsync(buffer);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort(
      (a, b) =>
        Number(a.match(/(\d+)/)![1]) - Number(b.match(/(\d+)/)![1]),
    );

  const parts: string[] = [];
  for (let i = 0; i < slides.length; i += 1) {
    const xml = await zip.file(slides[i]!)!.async("string");
    const text = xmlText(xml, /<\/a:p>|<\/a:br>/g).trim();
    if (text) parts.push(`--- Slide ${i + 1} ---\n${text}`);
  }
  return cap(parts.join("\n\n"));
}

async function fromOpenDocument(buffer: Buffer): Promise<Extracted> {
  const zip = await JSZip.loadAsync(buffer);
  const content = zip.file("content.xml");
  if (!content) return { text: "", truncated: false, note: "Isi berkas tidak ditemukan." };
  const xml = await content.async("string");
  const text = xmlText(
    xml,
    /<\/text:p>|<\/text:h>|<text:line-break\s*\/>|<\/table:table-row>/g,
  );
  return cap(text);
}

export async function extractText(
  filename: string,
  buffer: Buffer,
): Promise<Extracted> {
  const ext = extensionOf(filename);

  switch (ext) {
    case "pdf":
      return fromPdf(buffer);
    case "docx":
      return fromDocx(buffer);
    case "doc":
      return fromLegacyDoc(buffer);
    case "xlsx":
    case "xls":
      return fromSpreadsheet(buffer);
    case "pptx":
      return fromPptx(buffer);
    case "odt":
    case "ods":
    case "odp":
      return fromOpenDocument(buffer);
    case "html":
    case "htm":
      return cap(stripHtml(buffer.toString("utf8")));
    case "rtf":
      return cap(
        buffer
          .toString("utf8")
          .replace(/\\'[0-9a-f]{2}/gi, " ")
          .replace(/\\[a-z]+-?\d*\s?/gi, " ")
          .replace(/[{}]/g, " "),
      );
    default:
      if (TEXT_LIKE_EXTENSIONS.includes(ext)) {
        return cap(buffer.toString("utf8"));
      }
      throw new Error("Jenis berkas ini belum didukung.");
  }
}
