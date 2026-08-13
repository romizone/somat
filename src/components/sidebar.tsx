"use client";

import { Moon, Plus, Sun, Trash2, X } from "lucide-react";
import type { Conversation } from "@/lib/types";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  theme: "light" | "dark";
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onToggleTheme: () => void;
};

function groupLabel(timestamp: number): string {
  const day = 86_400_000;
  const age = Date.now() - timestamp;
  if (age < day) return "Hari ini";
  if (age < day * 7) return "7 hari terakhir";
  if (age < day * 30) return "30 hari terakhir";
  return "Lebih lama";
}

export function Sidebar({
  conversations,
  activeId,
  open,
  theme,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onToggleTheme,
}: Props) {
  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const label = groupLabel(conversation.updatedAt);
    const bucket = groups.get(label) ?? [];
    bucket.push(conversation);
    groups.set(label, bucket);
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Tutup panel"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-line bg-card transition-transform md:static md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pb-3 pt-4">
          <div>
            <p className="text-lg font-semibold tracking-tight text-primary">Somat</p>
            <p className="text-[0.7rem] leading-tight text-muted">
              AI Chat Indonesia · teks &amp; gambar
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup panel"
            className="rounded-lg p-1.5 text-muted transition hover:bg-tint md:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={onNew}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-white transition hover:bg-interactive"
          >
            <Plus size={16} />
            Percakapan baru
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-4">
          {conversations.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted">
              Belum ada percakapan.
            </p>
          )}

          {[...groups.entries()].map(([label, items]) => (
            <div key={label} className="mb-3">
              <p className="px-3 pb-1 text-[0.68rem] font-medium uppercase tracking-wide text-muted">
                {label}
              </p>
              {items.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`group flex items-center gap-1 rounded-lg pr-1 transition ${
                    conversation.id === activeId
                      ? "bg-tint text-primary"
                      : "text-text hover:bg-tint/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm"
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Hapus ${conversation.title}`}
                    onClick={() => onDelete(conversation.id)}
                    className="rounded p-1.5 text-muted opacity-0 transition hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition hover:bg-tint hover:text-primary"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            {theme === "dark" ? "Mode terang" : "Mode gelap"}
          </button>
          <p className="px-3 pt-2 text-[0.68rem] leading-relaxed text-muted">
            Riwayat tersimpan di perangkat ini saja.
          </p>
        </div>
      </aside>
    </>
  );
}
