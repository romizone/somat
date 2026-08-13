"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Loader2, Paperclip, Square, X } from "lucide-react";
import {
  ACCEPT_ATTR,
  MAX_FILES,
  processFiles,
} from "@/lib/client/attachments";
import type { Attachment } from "@/lib/types";

type Props = {
  busy: boolean;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
};

export function Composer({ busy, onSend, onStop }: Props) {
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const element = textarea.current;
    if (!element) return;
    // Kecilkan dulu supaya scrollHeight mengukur isi, bukan tinggi saat ini.
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`;
  }, [text]);

  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    const room = MAX_FILES - attachments.filter((a) => a.kind !== "error").length;
    if (room <= 0) {
      setErrors([`Maksimal ${MAX_FILES} lampiran per pesan.`]);
      return;
    }

    setErrors([]);
    const result = await processFiles(files.slice(0, room), setProgress);
    setAttachments((current) => [...current, ...result.attachments]);
    if (result.errors.length) setErrors(result.errors);
  };

  const submit = () => {
    const trimmed = text.trim();
    if (busy || progress) return;
    if (!trimmed && !attachments.length) return;
    onSend(trimmed, attachments);
    setText("");
    setAttachments([]);
    setErrors([]);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      void addFiles(files);
    }
  };

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void addFiles(Array.from(event.dataTransfer.files));
      }}
      className={`rounded-2xl border bg-card p-2 shadow-sm transition ${
        dragging ? "border-interactive ring-2 ring-interactive/25" : "border-line"
      }`}
    >
      {(attachments.length > 0 || progress || errors.length > 0) && (
        <div className="flex flex-col gap-2 px-1 pb-2 pt-1">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <span
                  key={`${attachment.name}-${index}`}
                  className="flex items-center gap-2 rounded-lg border border-line bg-tint/60 py-1 pl-1.5 pr-1 text-xs text-text"
                >
                  {attachment.kind === "image" ? (
                    <img
                      src={attachment.dataUrl}
                      alt=""
                      className="size-6 rounded object-cover"
                    />
                  ) : (
                    <Paperclip size={12} className="ml-1 text-primary" />
                  )}
                  <span className="max-w-40 truncate">{attachment.name}</span>
                  <button
                    type="button"
                    aria-label={`Hapus ${attachment.name}`}
                    onClick={() =>
                      setAttachments((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    className="rounded p-1 text-muted transition hover:bg-card hover:text-primary"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {progress && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={13} className="animate-spin text-primary" />
              {progress}
            </p>
          )}

          {errors.map((error) => (
            <p key={error} className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          onChange={(event) => {
            void addFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label="Lampirkan berkas"
          title="Lampirkan dokumen atau gambar"
          className="mb-1 rounded-xl p-2.5 text-muted transition hover:bg-tint hover:text-primary"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          ref={textarea}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          rows={1}
          placeholder="Tulis pesan…"
          className="max-h-55 flex-1 resize-none bg-transparent py-3 text-[0.95rem] leading-relaxed text-text outline-none placeholder:text-muted"
        />

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Hentikan"
            className="mb-1 flex size-10 items-center justify-center rounded-xl bg-tint text-primary transition hover:bg-highlight/40"
          >
            <Square size={15} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={Boolean(progress) || (!text.trim() && !attachments.length)}
            aria-label="Kirim"
            className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary text-white transition hover:bg-interactive disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
