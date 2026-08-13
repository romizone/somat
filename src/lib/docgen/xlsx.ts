import { parseMarkdown } from "@/lib/docgen/markdown";

/**
 * Setiap tabel Markdown menjadi satu lembar. Heading terakhir sebelum tabel
 * dipakai sebagai nama lembar. Kalau tidak ada tabel sama sekali, seluruh isi
 * dituangkan sebagai baris teks supaya berkasnya tetap berguna.
 */
export async function buildXlsx(
  title: string,
  markdown: string,
): Promise<Buffer> {
  const XLSX = await import("xlsx");
  const blocks = parseMarkdown(markdown);
  const book = XLSX.utils.book_new();
  const used = new Set<string>();

  const sheetName = (raw: string): string => {
    const base =
      raw.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 28) || "Lembar";
    let name = base;
    let counter = 2;
    while (used.has(name.toLowerCase())) {
      name = `${base.slice(0, 25)} ${counter}`;
      counter += 1;
    }
    used.add(name.toLowerCase());
    return name;
  };

  const columnWidths = (rows: string[][]) => {
    const widths: number[] = [];
    for (const row of rows) {
      row.forEach((cell, index) => {
        const length = Math.min(String(cell ?? "").length + 2, 60);
        widths[index] = Math.max(widths[index] ?? 10, length);
      });
    }
    return widths.map((w) => ({ wch: w }));
  };

  let lastHeading = title;
  let tableCount = 0;

  for (const block of blocks) {
    if (block.type === "heading") {
      lastHeading = block.text;
      continue;
    }
    if (block.type !== "table") continue;

    const rows = [block.header, ...block.rows];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = columnWidths(rows);
    sheet["!freeze"] = { xSplit: "0", ySplit: "1" };
    XLSX.utils.book_append_sheet(book, sheet, sheetName(lastHeading));
    tableCount += 1;
  }

  if (!tableCount) {
    const rows: string[][] = [[title], [""]];
    for (const block of blocks) {
      switch (block.type) {
        case "heading":
          rows.push([""], [block.text]);
          break;
        case "paragraph":
        case "quote":
          rows.push([block.text]);
          break;
        case "list":
          for (const item of block.items) {
            rows.push([`${"  ".repeat(item.level)}• ${item.text}`]);
          }
          break;
        case "code":
          for (const line of block.text.split("\n")) rows.push([line]);
          break;
        case "hr":
          rows.push([""]);
          break;
      }
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(book, sheet, sheetName(title));
  }

  const out = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.from(out);
}
