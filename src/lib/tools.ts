import { LIMITS, WEB_SEARCH_ENABLED } from "@/lib/config";
import type { ServerToolDef, ToolDef } from "@/lib/openrouter";

export const ASPECT_RATIOS = [
  "1:1",
  "3:2",
  "2:3",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
] as const;

export const TOOLS: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "buat_gambar",
      description:
        "Membuat satu gambar dari deskripsi teks. Pakai ini setiap kali pengguna minta dibuatkan gambar, ilustrasi, foto, poster, logo, ikon, atau desain visual.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Deskripsi gambar yang detail dalam Bahasa Inggris: subjek, gaya visual, komposisi, pencahayaan, latar, dan suasana.",
          },
          rasio: {
            type: "string",
            enum: [...ASPECT_RATIOS],
            description: "Rasio aspek gambar. Default 1:1.",
          },
          kualitas: {
            type: "string",
            enum: ["low", "medium", "high"],
            description:
              "Tingkat kualitas render. Default medium; pakai high hanya kalau pengguna memang minta hasil terbaik.",
          },
        },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buat_dokumen",
      description:
        "Membuat berkas Word (docx), Excel (xlsx), PowerPoint (pptx), atau PDF yang langsung bisa diunduh pengguna. Pakai ini setiap kali pengguna minta dibuatkan dokumen, laporan, surat, tabel, spreadsheet, presentasi, atau PDF.",
      parameters: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["docx", "xlsx", "pptx", "pdf"],
            description: "Jenis berkas yang dibuat.",
          },
          judul: {
            type: "string",
            description: "Judul dokumen yang tampil di halaman/slide pertama.",
          },
          nama_file: {
            type: "string",
            description:
              "Nama berkas tanpa ekstensi, huruf kecil, pakai tanda hubung. Contoh: laporan-penjualan-q3.",
          },
          konten_markdown: {
            type: "string",
            description:
              "Seluruh isi dokumen dalam Markdown: heading, paragraf, daftar, tabel, dan blok kode. Harus lengkap dan final, bukan ringkasan.",
          },
        },
        required: ["format", "judul", "konten_markdown"],
        additionalProperties: false,
      },
    },
  },
];

/**
 * Alat bawaan OpenRouter: penelusuran web dan pembacaan halaman. Dijalankan
 * di sisi OpenRouter, jadi tidak ada yang perlu kita eksekusi — hasilnya
 * langsung dipakai model dan sumbernya kembali sebagai kutipan.
 */
export const SERVER_TOOLS: ServerToolDef[] = [
  {
    type: "openrouter:web_search",
    parameters: {
      max_results: LIMITS.webSearchMaxResults,
      max_uses: LIMITS.webSearchMaxUses,
      max_total_results: LIMITS.webSearchMaxTotal,
    },
  },
  { type: "openrouter:web_fetch" },
];

/** Gabungan alat yang ditawarkan ke model dalam satu giliran. */
export function toolsForTurn(): ToolDef[] {
  return WEB_SEARCH_ENABLED ? [...TOOLS, ...SERVER_TOOLS] : TOOLS;
}
