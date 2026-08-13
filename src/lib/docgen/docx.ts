import type { Block, Inline } from "@/lib/docgen/markdown";
import { parseMarkdown } from "@/lib/docgen/markdown";

const PRIMARY = "2556BC";
const NEUTRAL = "515151";
const SURFACE = "E7F1F9";

export async function buildDocx(
  title: string,
  markdown: string,
): Promise<Buffer> {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  const runsOf = (runs: Inline[], opts?: { size?: number; color?: string }) =>
    runs.map(
      (run) =>
        new TextRun({
          text: run.text,
          bold: run.bold,
          italics: run.italic,
          font: run.code ? "Consolas" : undefined,
          size: opts?.size,
          color: opts?.color,
        }),
    );

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 40, color: PRIMARY })],
      spacing: { after: 240 },
    }),
  ];

  const headingLevel = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
  } as const;

  for (const block of parseMarkdown(markdown) as Block[]) {
    switch (block.type) {
      case "heading":
        children.push(
          new Paragraph({
            heading: headingLevel[block.level],
            spacing: { before: 240, after: 120 },
            children: runsOf(block.runs, { color: PRIMARY }),
          }),
        );
        break;

      case "paragraph":
        children.push(
          new Paragraph({
            spacing: { after: 140, line: 300 },
            children: runsOf(block.runs),
          }),
        );
        break;

      case "list": {
        let counter = 0;
        for (const item of block.items) {
          if (item.level === 0) counter += 1;
          children.push(
            new Paragraph({
              spacing: { after: 60, line: 280 },
              indent: { left: 360 + item.level * 360 },
              bullet: block.ordered ? undefined : { level: item.level },
              children: block.ordered
                ? [new TextRun({ text: `${counter}. ` }), ...runsOf(item.runs)]
                : runsOf(item.runs),
            }),
          );
        }
        break;
      }

      case "quote":
        children.push(
          new Paragraph({
            spacing: { before: 120, after: 120 },
            indent: { left: 360 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: PRIMARY, space: 8 },
            },
            children: runsOf(block.runs, { color: NEUTRAL }),
          }),
        );
        break;

      case "code":
        for (const line of block.text.split("\n")) {
          children.push(
            new Paragraph({
              spacing: { after: 0, line: 260 },
              shading: { type: ShadingType.CLEAR, fill: SURFACE },
              children: [
                new TextRun({ text: line || " ", font: "Consolas", size: 19 }),
              ],
            }),
          );
        }
        children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
        break;

      case "table": {
        const widths = block.header.map(() => ({
          size: Math.floor(100 / Math.max(block.header.length, 1)),
          type: WidthType.PERCENTAGE,
        }));

        const headerRow = new TableRow({
          tableHeader: true,
          children: block.header.map((cell, index) =>
            new TableCell({
              width: widths[index],
              shading: { type: ShadingType.CLEAR, fill: SURFACE },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: cell, bold: true, color: PRIMARY })],
                }),
              ],
            }),
          ),
        });

        const bodyRows = block.rows.map(
          (row) =>
            new TableRow({
              children: block.header.map((_, index) =>
                new TableCell({
                  width: widths[index],
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [new Paragraph({ text: row[index] ?? "" })],
                }),
              ),
            }),
        );

        children.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows],
          }),
        );
        children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
        break;
      }

      case "hr":
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 160 },
            alignment: AlignmentType.CENTER,
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "D5DEE8", space: 4 },
            },
            children: [],
          }),
        );
        break;
    }
  }

  const doc = new Document({
    creator: "Somat",
    title,
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22, color: "222222" } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
