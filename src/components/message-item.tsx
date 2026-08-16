"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  FileText,
  FileType2,
  Globe,
  Image as ImageIcon,
  Paperclip,
  Presentation,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { DocCard, downloadDocument } from "@/components/doc-card";
import { ImageCard } from "@/components/image-card";
import type { ChatMessage, DocFormat } from "@/lib/types";

const EXPORT_OPTIONS: Array<{
  format: DocFormat;
  label: string;
  Icon: typeof FileText;
}> = [
  { format: "docx", label: "Word (.docx)", Icon: FileText },
  { format: "xlsx", label: "Excel (.xlsx)", Icon: FileSpreadsheet },
  { format: "pptx", label: "PowerPoint (.pptx)", Icon: Presentation },
  { format: "pdf", label: "PDF (.pdf)", Icon: FileType2 },
];

/** Nama domain saja, supaya asal sumbernya terbaca sekilas. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function titleFrom(markdown: string): string {
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m);
  if (heading) return heading[1]!.trim().slice(0, 90);
  const firstLine = markdown.split("\n").find((line) => line.trim());
  return (firstLine ?? "Dokumen").replace(/[#*`>]/g, "").trim().slice(0, 90) || "Dokumen";
}

function slugFrom(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "dokumen"
  );
}

function AttachmentChips({ message }: { message: ChatMessage }) {
  const attachments = message.attachments ?? [];
  if (!attachments.length) return null;

  return (
    <div className="mb-2 flex flex-wrap justify-end gap-2">
      {attachments.map((attachment, index) =>
        attachment.kind === "image" ? (
          <img
            key={`${attachment.name}-${index}`}
            src={attachment.dataUrl}
            alt={attachment.name}
            className="size-16 rounded-lg border border-line object-cover"
          />
        ) : (
          <span
            key={`${attachment.name}-${index}`}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-muted"
          >
            {attachment.kind === "text" ? <Paperclip size={12} /> : <ImageIcon size={12} />}
            <span className="max-w-45 truncate">{attachment.name}</span>
          </span>
        ),
      )}
    </div>
  );
}

function ExportMenu({ markdown }: { markdown: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DocFormat | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const save = async (format: DocFormat) => {
    setBusy(format);
    try {
      const title = titleFrom(markdown);
      await downloadDocument({
        format,
        title,
        filename: slugFrom(title),
        markdown,
      });
      setOpen(false);
    } catch {
      // Kegagalan sudah terlihat lewat tombol yang berhenti memuat.
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative" ref={container}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-tint hover:text-primary"
      >
        Simpan sebagai
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-1 w-48 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
          {EXPORT_OPTIONS.map(({ format, label, Icon }) => (
            <button
              key={format}
              type="button"
              onClick={() => save(format)}
              disabled={busy !== null}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-text transition hover:bg-tint disabled:opacity-60"
            >
              <Icon size={14} className="text-primary" />
              {busy === format ? "Menyiapkan…" : label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MessageItem({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Papan klip tidak tersedia.
    }
  };

  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <AttachmentChips message={message} />
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble px-4 py-2.5 text-[0.95rem] leading-relaxed text-bubble-text">
          {message.content}
        </div>
      </div>
    );
  }

  const hasBody = Boolean(message.content.trim());

  return (
    <div className="group flex flex-col gap-3">
      {hasBody && (
        <div className={streaming ? "caret" : undefined}>
          <Markdown>{message.content}</Markdown>
        </div>
      )}

      {message.images?.map((image) => <ImageCard key={image.id} image={image} />)}
      {message.docs?.map((doc) => <DocCard key={doc.id} doc={doc} />)}

      {message.citations && message.citations.length > 0 && (
        <div className="rounded-xl border border-line bg-tint/40 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Globe size={13} />
            Sumber dari web
          </p>
          <ol className="flex flex-col gap-1.5">
            {message.citations.map((citation, index) => (
              <li key={citation.url} className="flex gap-2 text-xs">
                <span className="tabular-nums text-muted">{index + 1}.</span>
                <a
                  href={citation.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 flex-1 truncate text-interactive hover:underline"
                  title={citation.url}
                >
                  {citation.title}
                  <span className="ml-1.5 text-muted">
                    {hostOf(citation.url)}
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}

      {message.error && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {message.error}
        </p>
      )}

      {!streaming && hasBody && (
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted transition hover:bg-tint hover:text-primary"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Tersalin" : "Salin"}
          </button>
          <ExportMenu markdown={message.content} />
        </div>
      )}
    </div>
  );
}
