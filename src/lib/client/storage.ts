"use client";

import type { Conversation } from "@/lib/types";

/**
 * Riwayat percakapan disimpan di IndexedDB peramban pengguna — tidak ada
 * basis data di sisi server. Gambar hasil buatan ikut tersimpan sebagai
 * data URL, jadi IndexedDB dipakai (bukan localStorage) agar tidak kena
 * batas 5 MB.
 */

const DB_NAME = "somat";
const STORE = "conversations";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("[storage] IndexedDB tidak tersedia", request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn("[storage] operasi gagal", request.error);
      resolve(null);
    };
  });
}

export async function loadConversations(): Promise<Conversation[]> {
  const all = await withStore<Conversation[]>("readonly", (store) =>
    store.getAll() as IDBRequest<Conversation[]>,
  );
  if (!all) return [];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  await withStore("readwrite", (store) => store.put(conversation));
}

export async function removeConversation(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function clearConversations(): Promise<void> {
  await withStore("readwrite", (store) => store.clear());
}
