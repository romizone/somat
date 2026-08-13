"use client";

/**
 * Tema disimpan pada elemen <html> (dipasang oleh skrip kecil di layout sebelum
 * render pertama). Komponen membacanya lewat useSyncExternalStore supaya nilai
 * di server dan di peramban tidak pernah bentrok.
 */

export type Theme = "light" | "dark";

const STORAGE_KEY = "somat.theme";
const listeners = new Set<() => void>();

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function getServerTheme(): Theme {
  return "light";
}

export function setTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Penyimpanan lokal diblokir; tema tetap berlaku untuk sesi ini.
  }
  for (const listener of listeners) listener();
}
