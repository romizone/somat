import type { DocFormat } from "@/lib/types";

export const DOC_META: Record<
  DocFormat,
  { label: string; extension: string; mime: string }
> = {
  docx: {
    label: "Word",
    extension: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    label: "Excel",
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    label: "PowerPoint",
    extension: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  pdf: { label: "PDF", extension: "pdf", mime: "application/pdf" },
};

export async function buildDocument(
  format: DocFormat,
  title: string,
  markdown: string,
): Promise<Buffer> {
  switch (format) {
    case "docx": {
      const { buildDocx } = await import("@/lib/docgen/docx");
      return buildDocx(title, markdown);
    }
    case "xlsx": {
      const { buildXlsx } = await import("@/lib/docgen/xlsx");
      return buildXlsx(title, markdown);
    }
    case "pptx": {
      const { buildPptx } = await import("@/lib/docgen/pptx");
      return buildPptx(title, markdown);
    }
    case "pdf": {
      const { buildPdf } = await import("@/lib/docgen/pdf");
      return buildPdf(title, markdown);
    }
  }
}
