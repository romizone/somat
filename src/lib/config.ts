/**
 * Konfigurasi server. Semua nilai sensitif hanya hidup di sisi server —
 * tidak ada satu pun yang di-prefix NEXT_PUBLIC_, jadi tidak pernah sampai ke browser.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

/**
 * Nama-nama model sengaja hanya ada di sini. Tidak pernah dikirim ke klien,
 * tidak pernah disebut di prompt sistem, dan tidak pernah muncul di pesan error.
 */
export const TEXT_MODEL = process.env.TEXT_MODEL ?? "deepseek/deepseek-v4-flash";
export const VISION_MODEL = process.env.VISION_MODEL ?? "google/gemini-3.5-flash-lite";
export const IMAGE_MODEL =
  process.env.IMAGE_MODEL ?? "google/gemini-2.5-flash-image";

/** Atribusi aplikasi di dashboard OpenRouter. */
export const SITE_URL = process.env.SITE_URL ?? "https://somat.rominur.com";
export const SITE_NAME = process.env.SITE_NAME ?? "Somat";

/**
 * Penelusuran web dijalankan OpenRouter di sisi mereka (server tools), jadi
 * model bisa mencari sendiri saat butuh informasi terkini. Ada biaya per
 * pencarian, karena itu jumlah pemakaiannya per giliran dibatasi.
 */
export const WEB_SEARCH_ENABLED = process.env.WEB_SEARCH_ENABLED !== "off";

export const LIMITS = {
  /** Berapa kali model boleh mencari dalam satu giliran percakapan. */
  webSearchMaxUses: num("WEB_SEARCH_MAX_USES", 3),
  /** Jumlah hasil per pencarian. */
  webSearchMaxResults: num("WEB_SEARCH_MAX_RESULTS", 5),
  /** Batas total hasil lintas pencarian, penjaga ukuran konteks dan biaya. */
  webSearchMaxTotal: num("WEB_SEARCH_MAX_TOTAL", 12),

  /** Panjang maksimum satu pesan pengguna (karakter). */
  maxMessageChars: num("MAX_MESSAGE_CHARS", 24_000),
  /** Total karakter riwayat yang dikirim ke model; sisanya dipangkas dari yang terlama. */
  maxHistoryChars: num("MAX_HISTORY_CHARS", 140_000),
  /** Batas token keluaran per balasan. */
  maxOutputTokens: num("MAX_OUTPUT_TOKENS", 8192),

  /** Chat: jendela pendek (anti-spam) dan kuota harian per IP. */
  chatBurst: num("CHAT_BURST_LIMIT", 20),
  chatBurstWindowSec: num("CHAT_BURST_WINDOW_SEC", 300),
  chatDaily: num("CHAT_DAILY_LIMIT", 300),

  /** Gambar: jauh lebih mahal, jadi batasnya lebih ketat. */
  imageBurst: num("IMAGE_BURST_LIMIT", 5),
  imageBurstWindowSec: num("IMAGE_BURST_WINDOW_SEC", 600),
  imageDaily: num("IMAGE_DAILY_LIMIT", 20),
  /** Kuota gambar harian untuk seluruh situs, bukan per IP. */
  imageGlobalDaily: num("IMAGE_GLOBAL_DAILY_LIMIT", 100),

  /** Unggahan berkas. */
  maxUploadBytes: num("MAX_UPLOAD_BYTES", 12 * 1024 * 1024),
  maxUploadFiles: num("MAX_UPLOAD_FILES", 5),
  /** Teks hasil ekstraksi dipotong supaya satu berkas raksasa tidak menghabiskan konteks. */
  maxExtractedChars: num("MAX_EXTRACTED_CHARS", 120_000),
};

/** Opsional: Upstash Redis REST — dipakai kalau diisi, supaya kuota tetap akurat di serverless. */
export const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL ?? "";
export const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
export const hasSharedStore = Boolean(UPSTASH_URL && UPSTASH_TOKEN);
