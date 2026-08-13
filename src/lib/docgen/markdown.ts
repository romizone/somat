/**
 * Parser Markdown ringan yang cukup untuk kebutuhan ekspor dokumen:
 * heading, paragraf, daftar, tabel GFM, blok kode, kutipan, dan garis pemisah.
 */

export type Inline = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

export type ListItem = { runs: Inline[]; text: string; level: number };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string; runs: Inline[] }
  | { type: "paragraph"; text: string; runs: Inline[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "code"; text: string; lang?: string }
  | { type: "quote"; text: string; runs: Inline[] }
  | { type: "hr" };

const INLINE_PATTERN = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

/** Ubah tautan Markdown jadi teks biasa; dokumen cetak tidak butuh sintaksnya. */
function flattenLinks(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_all, label: string, url: string) =>
      label.trim() === url.trim() ? label : `${label} (${url})`,
    );
}

export function parseInline(raw: string): Inline[] {
  const text = flattenLinks(raw);
  const runs: Inline[] = [];
  let last = 0;

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) runs.push({ text: text.slice(last, index) });

    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith("`")) {
      runs.push({ text: token.slice(1, -1), code: true });
    } else {
      runs.push({ text: token.slice(1, -1), italic: true });
    }
    last = index + token.length;
  }

  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length ? runs : [{ text }];
}

/** Versi polos dari sepotong Markdown — dipakai untuk sel tabel dan judul slide. */
export function plainText(raw: string): string {
  return parseInline(raw)
    .map((r) => r.text)
    .join("")
    .trim();
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => plainText(cell.trim()));
}

function isSeparator(line: string): boolean {
  return /^\s*\|?[\s:-]*-[-\s:|]*\|?\s*$/.test(line) && line.includes("-");
}

export function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (text) blocks.push({ type: "paragraph", text: plainText(text), runs: parseInline(text) });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    // Blok kode berpagar
    const fence = trimmed.match(/^```+\s*(\S+)?/);
    if (fence) {
      flushParagraph();
      const lang = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```+\s*$/.test(lines[i]!.trim())) {
        body.push(lines[i]!);
        i += 1;
      }
      blocks.push({ type: "code", text: body.join("\n"), lang });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1]!.length, 4) as 1 | 2 | 3 | 4;
      const text = heading[2]!.trim();
      blocks.push({ type: "heading", level, text: plainText(text), runs: parseInline(text) });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "hr" });
      continue;
    }

    // Tabel GFM: baris header diikuti baris pemisah
    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1]!)
    ) {
      flushParagraph();
      const header = splitRow(trimmed);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes("|") && lines[i]!.trim()) {
        rows.push(splitRow(lines[i]!));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "table", header, rows });
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    const ordered = line.match(/^(\s*)\d+[.)]\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const items: ListItem[] = [];

      while (i < lines.length) {
        const current = lines[i]!;
        const match = isOrdered
          ? current.match(/^(\s*)\d+[.)]\s+(.*)$/)
          : current.match(/^(\s*)[-*+]\s+(.*)$/);
        if (!match) break;
        const indent = match[1]!.length;
        const content = match[2]!.trim();
        items.push({
          level: Math.min(Math.floor(indent / 2), 3),
          text: plainText(content),
          runs: parseInline(content),
        });
        i += 1;
      }
      i -= 1;
      blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      const text = quote[1]!.trim();
      blocks.push({ type: "quote", text: plainText(text), runs: parseInline(text) });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return blocks;
}
