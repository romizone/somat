import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { parseMarkdown, type Inline } from "@/lib/docgen/markdown";

/**
 * PDF dibangun dengan pdf-lib memakai font standar PDF (Helvetica/Courier),
 * jadi tidak ada berkas font yang perlu ikut di-bundle ke serverless.
 * Konsekuensinya: karakter di luar Latin-1 (mis. aksara CJK, emoji) diganti
 * supaya proses tidak gagal total.
 */

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BODY_SIZE = 10.5;
const LINE_RATIO = 1.45;

const WINANSI_EXTRA = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".split(""),
);

function sanitize(input: string): string {
  let out = "";
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code === 9) out += "    ";
    else if (code < 32) out += " ";
    else if (code <= 0xff || WINANSI_EXTRA.has(char)) out += char;
    else if (char === "→") out += "->";
    else if (char === "≥") out += ">=";
    else if (char === "≤") out += "<=";
    else out += "?";
  }
  return out;
}

type Token = { text: string; font: PDFFont; size: number; color: RGB };

export async function buildPdf(
  title: string,
  markdown: string,
): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");

  const PRIMARY = rgb(0.145, 0.337, 0.737); // #2556BC
  const NEUTRAL = rgb(0.318, 0.318, 0.318); // #515151
  const BODY = rgb(0.13, 0.13, 0.13);
  const RULE = rgb(0.835, 0.871, 0.91);
  const SURFACE = rgb(0.906, 0.945, 0.976); // #E7F1F9

  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreator("Somat");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let page: PDFPage = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - MARGIN;
  };

  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 24) newPage();
  };

  const fontFor = (run: Inline): PDFFont => {
    if (run.code) return mono;
    if (run.bold) return bold;
    if (run.italic) return italic;
    return regular;
  };

  /** Pecah token menjadi baris yang muat pada lebar tertentu. */
  const layout = (tokens: Token[], maxWidth: number): Token[][] => {
    const lines: Token[][] = [];
    let line: Token[] = [];
    let width = 0;

    for (const token of tokens) {
      const pieces = token.text.split(/(\s+)/).filter((p) => p !== "");
      for (const piece of pieces) {
        const pieceWidth = token.font.widthOfTextAtSize(piece, token.size);
        if (width + pieceWidth > maxWidth && line.length) {
          lines.push(line);
          line = [];
          width = 0;
          if (/^\s+$/.test(piece)) continue;
        }
        if (!line.length && /^\s+$/.test(piece)) continue;
        line.push({ ...token, text: piece });
        width += pieceWidth;
      }
    }
    if (line.length) lines.push(line);
    return lines.length ? lines : [[]];
  };

  const drawLines = (
    lines: Token[][],
    x: number,
    size: number,
    spacingAfter: number,
  ) => {
    const lineHeight = size * LINE_RATIO;
    for (const line of lines) {
      ensure(lineHeight);
      let cursor = x;
      for (const token of line) {
        page.drawText(token.text, {
          x: cursor,
          y: y - size,
          size: token.size,
          font: token.font,
          color: token.color,
        });
        cursor += token.font.widthOfTextAtSize(token.text, token.size);
      }
      y -= lineHeight;
    }
    y -= spacingAfter;
  };

  const tokensOf = (runs: Inline[], size: number, color: RGB): Token[] =>
    runs
      .map((run) => ({
        text: sanitize(run.text),
        font: fontFor(run),
        size: run.code ? size - 0.5 : size,
        color,
      }))
      .filter((t) => t.text.length > 0);

  // Judul dokumen
  drawLines(
    layout([{ text: sanitize(title), font: bold, size: 20, color: PRIMARY }], CONTENT_WIDTH),
    MARGIN,
    20,
    8,
  );
  page.drawRectangle({
    x: MARGIN,
    y: y + 4,
    width: 64,
    height: 2.5,
    color: PRIMARY,
  });
  y -= 20;

  const HEADING_SIZE = { 1: 17, 2: 14, 3: 12, 4: 11 } as const;

  for (const block of parseMarkdown(markdown)) {
    switch (block.type) {
      case "heading": {
        const size = HEADING_SIZE[block.level];
        ensure(size * 2.4);
        y -= 6;
        drawLines(
          layout(
            [{ text: sanitize(block.text), font: bold, size, color: PRIMARY }],
            CONTENT_WIDTH,
          ),
          MARGIN,
          size,
          6,
        );
        break;
      }

      case "paragraph":
        drawLines(
          layout(tokensOf(block.runs, BODY_SIZE, BODY), CONTENT_WIDTH),
          MARGIN,
          BODY_SIZE,
          6,
        );
        break;

      case "quote": {
        const indent = MARGIN + 14;
        const lines = layout(
          tokensOf(block.runs, BODY_SIZE, NEUTRAL),
          CONTENT_WIDTH - 14,
        );
        const height = lines.length * BODY_SIZE * LINE_RATIO;
        ensure(height);
        page.drawRectangle({
          x: MARGIN,
          y: y - height + BODY_SIZE * 0.5,
          width: 2.5,
          height,
          color: PRIMARY,
        });
        drawLines(lines, indent, BODY_SIZE, 6);
        break;
      }

      case "list": {
        for (const item of block.items) {
          const indent = MARGIN + 12 + item.level * 14;
          const marker = block.ordered ? "-" : "•";
          const lines = layout(
            tokensOf(item.runs, BODY_SIZE, BODY),
            CONTENT_WIDTH - (indent - MARGIN) - 12,
          );
          ensure(BODY_SIZE * LINE_RATIO);
          page.drawText(marker, {
            x: indent - 12,
            y: y - BODY_SIZE,
            size: BODY_SIZE,
            font: regular,
            color: PRIMARY,
          });
          drawLines(lines, indent, BODY_SIZE, 2);
        }
        y -= 6;
        break;
      }

      case "code": {
        const size = 9;
        const lineHeight = size * 1.5;
        const rows = block.text.split("\n");
        for (const row of rows) {
          const lines = layout(
            [{ text: sanitize(row) || " ", font: mono, size, color: BODY }],
            CONTENT_WIDTH - 16,
          );
          for (const line of lines) {
            ensure(lineHeight);
            page.drawRectangle({
              x: MARGIN,
              y: y - size - 3,
              width: CONTENT_WIDTH,
              height: lineHeight,
              color: SURFACE,
            });
            let cursor = MARGIN + 8;
            for (const token of line) {
              page.drawText(token.text, {
                x: cursor,
                y: y - size,
                size: token.size,
                font: token.font,
                color: token.color,
              });
              cursor += token.font.widthOfTextAtSize(token.text, token.size);
            }
            y -= lineHeight;
          }
        }
        y -= 8;
        break;
      }

      case "hr":
        ensure(16);
        page.drawRectangle({
          x: MARGIN,
          y: y - 6,
          width: CONTENT_WIDTH,
          height: 0.8,
          color: RULE,
        });
        y -= 16;
        break;

      case "table": {
        const columns = block.header.length;
        if (!columns) break;

        // Lebar kolom proporsional terhadap panjang isi, dengan batas minimum.
        const weights = block.header.map((header, index) => {
          const longest = Math.max(
            header.length,
            ...block.rows.map((row) => (row[index] ?? "").length),
          );
          return Math.min(Math.max(longest, 6), 40);
        });
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        const widths = weights.map((w) => (w / totalWeight) * CONTENT_WIDTH);

        const cellSize = 9;
        const cellLineHeight = cellSize * 1.4;
        const padding = 5;

        const drawRow = (cells: string[], header: boolean) => {
          const wrapped = cells.map((cell, index) =>
            layout(
              [
                {
                  text: sanitize(cell),
                  font: header ? bold : regular,
                  size: cellSize,
                  color: header ? PRIMARY : BODY,
                },
              ],
              widths[index]! - padding * 2,
            ),
          );
          const rowHeight =
            Math.max(...wrapped.map((w) => w.length)) * cellLineHeight + padding * 2;

          ensure(rowHeight);
          if (header) {
            page.drawRectangle({
              x: MARGIN,
              y: y - rowHeight,
              width: CONTENT_WIDTH,
              height: rowHeight,
              color: SURFACE,
            });
          }
          page.drawRectangle({
            x: MARGIN,
            y: y - rowHeight,
            width: CONTENT_WIDTH,
            height: 0.6,
            color: RULE,
          });

          let x = MARGIN;
          wrapped.forEach((lines, index) => {
            let cellY = y - padding;
            for (const line of lines) {
              let cursor = x + padding;
              for (const token of line) {
                page.drawText(token.text, {
                  x: cursor,
                  y: cellY - cellSize,
                  size: token.size,
                  font: token.font,
                  color: token.color,
                });
                cursor += token.font.widthOfTextAtSize(token.text, token.size);
              }
              cellY -= cellLineHeight;
            }
            x += widths[index]!;
          });

          y -= rowHeight;
        };

        ensure(60);
        drawRow(block.header, true);
        for (const row of block.rows) {
          drawRow(
            block.header.map((_, index) => row[index] ?? ""),
            false,
          );
        }
        y -= 10;
        break;
      }
    }
  }

  // Nomor halaman
  const pages = doc.getPages();
  pages.forEach((current, index) => {
    const label = `${index + 1} / ${pages.length}`;
    const width = regular.widthOfTextAtSize(label, 8.5);
    current.drawText(label, {
      x: (PAGE_WIDTH - width) / 2,
      y: MARGIN / 2,
      size: 8.5,
      font: regular,
      color: NEUTRAL,
    });
  });

  return Buffer.from(await doc.save());
}
