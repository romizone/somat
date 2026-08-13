"use client";

import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Presentation,
  FileType2,
} from "lucide-react";
import type { DocFormat, GeneratedDoc } from "@/lib/types";

const META: Record<
  DocFormat,
  { label: string; extension: string; Icon: typeof FileText }
> = {
  docx: { label: "Word", extension: "docx", Icon: FileText },
  xlsx: { label: "Excel", extension: "xlsx", Icon: FileSpreadsheet },
  pptx: { label: "PowerPoint", extension: "pptx", Icon: Presentation },
  pdf: { label: "PDF", extension: "pdf", Icon: FileType2 },
};

export async function downloadDocument(doc: {
  format: DocFormat;
  filename: string;
  title: string;
  markdown: string;
}): Promise<void> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Berkas gagal dibuat.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${doc.filename}.${META[doc.format].extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function DocCard({ doc }: { doc: GeneratedDoc }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { label, extension, Icon } = META[doc.format];

  const handleDownload = async () => {
    setBusy(true);
    setError(null);
    try {
      await downloadDocument(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Berkas gagal dibuat.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-tint/60 p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{doc.title}</p>
        <p className="truncate text-xs text-muted">
          {label} · {doc.filename}.{extension}
          {error ? ` · ${error}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition hover:bg-interactive disabled:opacity-60"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {busy ? "Menyiapkan" : "Unduh"}
      </button>
    </div>
  );
}
