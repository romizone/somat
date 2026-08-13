import {
  LIMITS,
  UPSTASH_TOKEN,
  UPSTASH_URL,
  hasSharedStore,
} from "@/lib/config";

/**
 * Penghitung kuota sederhana: satu kunci = satu jendela waktu.
 *
 * Tanpa Upstash, penghitung disimpan di memori proses. Di Vercel setiap instance
 * punya memorinya sendiri, jadi batas efektifnya bisa lebih longgar dari angka
 * yang tertulis. Isi UPSTASH_REDIS_REST_URL/TOKEN kalau butuh kuota yang persis.
 */

type Counter = { count: number; expiresAt: number };
const memory = new Map<string, Counter>();

function memoryIncr(key: string, ttlSec: number): number {
  const now = Date.now();
  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + ttlSec * 1000 });
    if (memory.size > 10_000) {
      for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
    }
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

async function upstashIncr(key: string, ttlSec: number): Promise<number> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(ttlSec), "NX"],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  const data = (await res.json()) as Array<{ result: number }>;
  return Number(data?.[0]?.result ?? 0);
}

async function incr(key: string, ttlSec: number): Promise<number> {
  if (hasSharedStore) {
    try {
      return await upstashIncr(key, ttlSec);
    } catch {
      // Kalau store bersama sedang bermasalah, jangan matikan situs —
      // turun ke penghitung memori supaya batas tetap ada.
    }
  }
  return memoryIncr(key, ttlSec);
}

export type Quota = { ok: true } | { ok: false; message: string };

const OK: Quota = { ok: true };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Ambil IP klien dari header proxy (Vercel selalu mengisi x-forwarded-for). */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("cf-connecting-ip") ??
    "anon"
  );
}

async function check(
  key: string,
  limit: number,
  ttlSec: number,
  message: string,
): Promise<Quota> {
  const used = await incr(key, ttlSec);
  return used > limit ? { ok: false, message } : OK;
}

/** Kuota untuk satu giliran percakapan. */
export async function checkChatQuota(ip: string): Promise<Quota> {
  const burst = await check(
    `c:b:${ip}`,
    LIMITS.chatBurst,
    LIMITS.chatBurstWindowSec,
    "Terlalu banyak permintaan dalam waktu singkat. Coba lagi beberapa menit lagi.",
  );
  if (!burst.ok) return burst;

  return check(
    `c:d:${ip}:${today()}`,
    LIMITS.chatDaily,
    86_400,
    "Kuota percakapan harian untuk koneksi ini sudah habis. Silakan lanjut besok.",
  );
}

/** Kuota untuk satu permintaan gambar (dipanggil sebelum request ke penyedia). */
export async function checkImageQuota(ip: string): Promise<Quota> {
  const burst = await check(
    `i:b:${ip}`,
    LIMITS.imageBurst,
    LIMITS.imageBurstWindowSec,
    "Pembuatan gambar sedang dibatasi untuk koneksi ini. Coba lagi sebentar lagi.",
  );
  if (!burst.ok) return burst;

  const daily = await check(
    `i:d:${ip}:${today()}`,
    LIMITS.imageDaily,
    86_400,
    "Kuota gambar harian untuk koneksi ini sudah habis. Silakan lanjut besok.",
  );
  if (!daily.ok) return daily;

  return check(
    `i:g:${today()}`,
    LIMITS.imageGlobalDaily,
    86_400,
    "Kuota gambar harian situs ini sudah habis. Silakan coba lagi besok.",
  );
}

/** Kuota unggahan berkas — memakai penghitung chat supaya tidak dipakai memutar-mutar. */
export async function checkUploadQuota(ip: string): Promise<Quota> {
  return check(
    `u:b:${ip}`,
    LIMITS.chatBurst * 2,
    LIMITS.chatBurstWindowSec,
    "Terlalu banyak unggahan dalam waktu singkat. Coba lagi beberapa menit lagi.",
  );
}
