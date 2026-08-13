import { parseMarkdown, type Block } from "@/lib/docgen/markdown";

/**
 * Tata letak deck mengikuti pola konsultan (McKinsey/Gartner):
 * satu pesan per slide, judul berupa kalimat kesimpulan (action title),
 * isi sebagai pendukung, lalu kicker "so what" di bawah dan baris sumber.
 *
 * Konvensi Markdown yang dipakai:
 *   ## Judul aksi     -> slide baru
 *   - poin            -> isi slide
 *   > kalimat         -> kicker "so what" di pita bawah
 *   Sumber: ...       -> catatan sumber di kaki slide
 */

const PRIMARY = "2556BC";
const INTERACTIVE = "467DDB";
const HIGHLIGHT = "85C3E5";
const SURFACE = "E7F1F9";
const NEUTRAL = "515151";

type Bullet = { text: string; level: number };
type SlideBase = { title: string; kicker?: string; source?: string };
type Slide =
  | (SlideBase & { kind: "content"; bullets: Bullet[] })
  | (SlideBase & { kind: "table"; header: string[]; rows: string[][] });

const MAX_BULLETS = 6;
const SOURCE_PATTERN = /^(sumber|source|catatan)\s*:\s*(.+)$/i;

function toSlides(title: string, blocks: Block[]): Slide[] {
  const slides: Slide[] = [];
  let current: Extract<Slide, { kind: "content" }> = {
    kind: "content",
    title,
    bullets: [],
  };

  const flush = () => {
    if (current.bullets.length || current.kicker) slides.push(current);
  };

  const start = (heading: string) => {
    flush();
    current = { kind: "content", title: heading, bullets: [] };
  };

  const addBullet = (text: string, level = 0) => {
    if (!text.trim()) return;
    if (current.bullets.length >= MAX_BULLETS) {
      const { title: previous, source } = current;
      flush();
      current = {
        kind: "content",
        title: `${previous} (lanjutan)`,
        bullets: [],
        source,
      };
    }
    current.bullets.push({ text, level });
  };

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        if (block.level <= 2) start(block.text);
        else addBullet(block.text, 0);
        break;

      case "paragraph": {
        const source = block.text.match(SOURCE_PATTERN);
        if (source) current.source = source[2]!.trim();
        else addBullet(block.text, 0);
        break;
      }

      case "quote": {
        // Kicker yang ditulis setelah tabel tetap menempel di slide tabelnya,
        // bukan bikin slide baru yang isinya cuma satu kalimat.
        const previous = slides[slides.length - 1];
        if (!current.bullets.length && !current.kicker && previous && !previous.kicker) {
          previous.kicker = block.text;
        } else {
          current.kicker = block.text;
        }
        break;
      }

      case "list":
        for (const item of block.items) addBullet(item.text, Math.min(item.level, 2));
        break;

      case "code":
        for (const line of block.text.split("\n").slice(0, MAX_BULLETS)) {
          addBullet(line, 1);
        }
        break;

      case "table": {
        const { title: heading, kicker, source } = current;
        current.kicker = undefined;
        flush();
        slides.push({
          kind: "table",
          title: heading,
          header: block.header,
          rows: block.rows.slice(0, 10),
          kicker,
          source,
        });
        current = { kind: "content", title: `${heading} (lanjutan)`, bullets: [], source };
        break;
      }

      case "hr":
        break;
    }
  }

  flush();
  return slides;
}

export async function buildPptx(
  title: string,
  markdown: string,
): Promise<Buffer> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.title = title;
  pptx.author = "Somat";

  const slides = toSlides(title, parseMarkdown(markdown));

  // Slide sampul
  const cover = pptx.addSlide();
  cover.background = { color: PRIMARY };
  cover.addText(title, {
    x: 0.62,
    y: 1.75,
    w: 8.6,
    h: 1.5,
    fontSize: 32,
    bold: true,
    color: "FFFFFF",
    valign: "middle",
  });
  cover.addShape(pptx.ShapeType.rect, {
    x: 0.62,
    y: 3.35,
    w: 1.5,
    h: 0.06,
    fill: { color: HIGHLIGHT },
  });
  cover.addText(new Date().toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }), {
    x: 0.62,
    y: 3.6,
    w: 6,
    h: 0.35,
    fontSize: 12,
    color: "D8E4F7",
  });

  slides.forEach((slide, index) => {
    const page = pptx.addSlide();
    page.background = { color: "FFFFFF" };

    // Pita tipis di tepi atas sebagai penanda merek
    page.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 10,
      h: 0.1,
      fill: { color: PRIMARY },
    });

    // Action title: kalimat kesimpulan, bukan sekadar label topik
    page.addText(slide.title, {
      x: 0.55,
      y: 0.32,
      w: 8.9,
      h: 0.85,
      fontSize: 19,
      bold: true,
      color: PRIMARY,
      valign: "top",
      lineSpacingMultiple: 1.05,
    });
    page.addShape(pptx.ShapeType.rect, {
      x: 0.55,
      y: 1.22,
      w: 8.9,
      h: 0.02,
      fill: { color: HIGHLIGHT },
    });

    const bodyHeight = slide.kicker ? 2.95 : 3.6;

    if (slide.kind === "table") {
      const rows = [
        slide.header.map((cell) => ({
          text: cell,
          options: { bold: true, color: PRIMARY, fill: { color: SURFACE } },
        })),
        ...slide.rows.map((row) =>
          slide.header.map((_, column) => ({
            text: row[column] ?? "",
            options: { color: "222222" },
          })),
        ),
      ];
      page.addTable(rows, {
        x: 0.55,
        y: 1.45,
        w: 8.9,
        fontSize: 11,
        border: { type: "solid", color: "D5DEE8", pt: 1 },
        autoPage: false,
      });
    } else {
      page.addText(
        slide.bullets.map((bullet) => ({
          text: bullet.text,
          options: {
            bullet: { indent: 18 },
            indentLevel: bullet.level,
            breakLine: true,
            color: bullet.level === 0 ? "222222" : NEUTRAL,
            fontSize: bullet.level === 0 ? 15 : 13,
          },
        })),
        {
          x: 0.62,
          y: 1.45,
          w: 8.8,
          h: bodyHeight,
          fontSize: 15,
          color: "222222",
          lineSpacingMultiple: 1.25,
          valign: "top",
        },
      );
    }

    // Kicker "so what" — inti yang harus dibawa pulang pembaca
    if (slide.kicker) {
      page.addShape(pptx.ShapeType.rect, {
        x: 0.55,
        y: 4.5,
        w: 8.9,
        h: 0.62,
        fill: { color: SURFACE },
      });
      page.addShape(pptx.ShapeType.rect, {
        x: 0.55,
        y: 4.5,
        w: 0.06,
        h: 0.62,
        fill: { color: INTERACTIVE },
      });
      page.addText(slide.kicker, {
        x: 0.75,
        y: 4.5,
        w: 8.5,
        h: 0.62,
        fontSize: 12,
        bold: true,
        color: PRIMARY,
        valign: "middle",
      });
    }

    // Kaki slide: sumber di kiri, nomor halaman di kanan
    if (slide.source) {
      page.addText(`Sumber: ${slide.source}`, {
        x: 0.55,
        y: 5.24,
        w: 7.6,
        h: 0.3,
        fontSize: 8,
        italic: true,
        color: NEUTRAL,
      });
    }
    page.addText(String(index + 1), {
      x: 9.1,
      y: 5.24,
      w: 0.4,
      h: 0.3,
      fontSize: 9,
      color: NEUTRAL,
      align: "right",
    });
  });

  const out = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return Buffer.from(out);
}
