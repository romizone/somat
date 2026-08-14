"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Menu, PenLine } from "lucide-react";
import { Composer } from "@/components/composer";
import { MessageItem } from "@/components/message-item";
import { Sidebar } from "@/components/sidebar";
import { readStream } from "@/lib/client/stream";
import {
  loadConversations,
  removeConversation,
  saveConversation,
} from "@/lib/client/storage";
import type { Attachment, ChatMessage, Conversation, Progress } from "@/lib/types";

const SUGGESTIONS = [
  "Ringkas isi dokumen yang saya unggah jadi lima poin penting",
  "Buatkan gambar suasana pasar pagi di Yogyakarta saat hujan",
  "Susun presentasi strategi penjualan kuartal depan",
  "Buatkan tabel anggaran rumah tangga bulanan dalam Excel",
];

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function titleFrom(text: string, attachments: Attachment[]): string {
  const base = text.trim() || attachments[0]?.name || "Percakapan baru";
  return base.length > 48 ? `${base.slice(0, 48)}…` : base;
}

export default function ChatApp() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  useEffect(() => {
    // Kelas tema dipasang di <html> sebelum hidrasi; hanya bisa dibaca setelah mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
    void loadConversations().then((stored) => {
      setConversations(stored);
      if (stored.length) setActiveId(stored[0]!.id);
    });
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("somat.theme", next);
    } catch {
      // Penyimpanan lokal diblokir; tema tetap berlaku untuk sesi ini.
    }
  };

  /** Jaga tampilan tetap menempel ke bawah selama pengguna tidak menggulir naik. */
  const onScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    pinnedRef.current = distance < 120;
  };

  useEffect(() => {
    if (!pinnedRef.current) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [active?.messages, status]);

  // Detik berjalan berdetak lokal tiap 1 detik; event progress dari server
  // (tiap ~1,5 detik) mengoreksi nilainya supaya tidak melenceng.
  const hasProgress = progress !== null;
  useEffect(() => {
    if (!hasProgress) return;
    const id = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [hasProgress]);

  const patchConversation = useCallback(
    (id: string, update: (conversation: Conversation) => Conversation) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === id ? update(conversation) : conversation,
        ),
      );
    },
    [],
  );

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => {
      patchConversation(conversationId, (conversation) => ({
        ...conversation,
        updatedAt: Date.now(),
        messages: conversation.messages.map((message) =>
          message.id === messageId ? { ...message, ...patch } : message,
        ),
      }));
    },
    [patchConversation],
  );

  const startNew = () => {
    abortRef.current?.abort();
    setActiveId(null);
    setSidebarOpen(false);
  };

  const deleteConversation = async (id: string) => {
    await removeConversation(id);
    setConversations((current) => current.filter((c) => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  const send = async (text: string, attachments: Attachment[]) => {
    // Hanya dipanggil dari event handler, bukan saat render.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: text,
      createdAt: now,
      attachments: attachments.length ? attachments : undefined,
    };
    const assistantMessage: ChatMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      createdAt: now + 1,
    };

    const base: Conversation = active ?? {
      id: newId(),
      title: titleFrom(text, attachments),
      createdAt: now,
      updatedAt: now,
      messages: [],
    };

    const started: Conversation = {
      ...base,
      title: base.messages.length ? base.title : titleFrom(text, attachments),
      updatedAt: now,
      messages: [...base.messages, userMessage, assistantMessage],
    };

    setConversations((current) => {
      const exists = current.some((c) => c.id === started.id);
      const next = exists
        ? current.map((c) => (c.id === started.id ? started : c))
        : [started, ...current];
      return next;
    });
    setActiveId(started.id);
    setBusy(true);
    setStatus(null);
    setProgress(null);
    pinnedRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    // Kumpulkan potongan teks lalu tulis ke state berkala supaya render tetap ringan.
    let buffer = "";
    let dirty = false;
    const flush = () => {
      if (!dirty) return;
      dirty = false;
      patchMessage(started.id, assistantMessage.id, { content: buffer });
    };
    const timer = window.setInterval(flush, 70);

    const images: ChatMessage["images"] = [];
    const docs: ChatMessage["docs"] = [];
    let failure: string | null = null;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          messages: started.messages
            .filter((message) => message.id !== assistantMessage.id)
            .map((message) => ({
              role: message.role,
              content: message.content,
              attachments: message.attachments,
            })),
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        failure = body.error ?? "Permintaan tidak dapat diproses.";
      } else {
        for await (const event of readStream(response)) {
          switch (event.type) {
            case "delta":
              buffer += event.text;
              dirty = true;
              break;
            case "status":
              setStatus(event.text);
              break;
            case "progress":
              setProgress(event.progress);
              setElapsedSec(event.progress.elapsedSec);
              break;
            case "image":
              images.push(event.image);
              setStatus(null);
              setProgress(null);
              patchMessage(started.id, assistantMessage.id, {
                content: buffer,
                images: [...images],
              });
              break;
            case "document":
              docs.push(event.doc);
              setStatus(null);
              setProgress(null);
              patchMessage(started.id, assistantMessage.id, {
                content: buffer,
                docs: [...docs],
              });
              break;
            case "error":
              failure = event.message;
              break;
            case "done":
              break;
          }
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.error("[chat] gagal", err);
        failure = "Koneksi terputus. Coba kirim ulang pesannya.";
      }
    } finally {
      window.clearInterval(timer);
      dirty = true;
      flush();
      setBusy(false);
      setStatus(null);
      setProgress(null);
      abortRef.current = null;

      const finished: ChatMessage = {
        ...assistantMessage,
        content: buffer,
        images: images.length ? images : undefined,
        docs: docs.length ? docs : undefined,
        error: failure ?? undefined,
      };

      patchConversation(started.id, (conversation) => {
        const updated: Conversation = {
          ...conversation,
          updatedAt: Date.now(),
          messages: conversation.messages.map((message) =>
            message.id === assistantMessage.id ? finished : message,
          ),
        };
        void saveConversation(updated);
        return updated;
      });
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStatus(null);
    setProgress(null);
  };

  const messages = active?.messages ?? [];
  const lastId = messages[messages.length - 1]?.id;

  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        theme={theme}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => {
          setActiveId(id);
          setSidebarOpen(false);
          pinnedRef.current = true;
        }}
        onNew={startNew}
        onDelete={deleteConversation}
        onToggleTheme={toggleTheme}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line bg-card/70 px-3 py-2.5 backdrop-blur md:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Buka panel"
            className="rounded-lg p-2 text-muted transition hover:bg-tint md:hidden"
          >
            <Menu size={18} />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {active?.title ?? "Somat"}
          </p>
          <button
            type="button"
            onClick={startNew}
            aria-label="Percakapan baru"
            className="rounded-lg p-2 text-muted transition hover:bg-tint hover:text-primary md:hidden"
          >
            <PenLine size={18} />
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-6 pt-10 text-center md:pt-20">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-primary md:text-3xl">
                    Ada yang bisa dibantu?
                  </h1>
                  <p className="mt-2 text-sm text-muted">
                    Tanya, unggah dokumen, atau minta dibuatkan gambar dan berkas.
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void send(suggestion, [])}
                      className="rounded-xl border border-line bg-card px-4 py-3 text-left text-sm text-text transition hover:border-interactive hover:text-primary"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  streaming={busy && message.id === lastId}
                />
              ))
            )}

            {busy && status && (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-2 text-sm text-muted">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  {status}
                  {progress && (
                    <span className="font-medium text-text">
                      {progress.percent}%
                    </span>
                  )}
                </p>
                {progress && (
                  <div className="flex max-w-sm items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tint">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {elapsedSec} dtk
                      {progress.etaSec > 0
                        ? ` · ±${progress.etaSec} dtk lagi`
                        : " · hampir selesai…"}
                    </span>
                  </div>
                )}
              </div>
            )}

            {busy && !status && messages[messages.length - 1]?.content === "" && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <Loader2 size={14} className="animate-spin text-primary" />
                Menyusun jawaban…
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-page px-3 pb-4 pt-3 md:px-6">
          <div className="mx-auto w-full max-w-3xl">
            <Composer busy={busy} onSend={(text, files) => void send(text, files)} onStop={stop} />
            <p className="px-1 pt-2 text-center text-[0.7rem] leading-relaxed text-muted">
              Somat bisa keliru — periksa lagi informasi penting. Gambar dan dokumen
              dibuat otomatis saat kamu memintanya.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
