export type Role = "user" | "assistant";

export type DocFormat = "docx" | "xlsx" | "pptx" | "pdf";

/** Berkas yang dilampirkan pengguna, sudah diproses jadi teks (atau gambar untuk dilihat model). */
export type Attachment =
  | { kind: "text"; name: string; bytes: number; text: string; note?: string }
  | { kind: "image"; name: string; bytes: number; dataUrl: string }
  | { kind: "error"; name: string; bytes: number; message: string };

export type GeneratedImage = {
  id: string;
  prompt: string;
  dataUrl: string;
};

export type GeneratedDoc = {
  id: string;
  format: DocFormat;
  filename: string;
  title: string;
  markdown: string;
};

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  attachments?: Attachment[];
  images?: GeneratedImage[];
  docs?: GeneratedDoc[];
  /** Diisi kalau giliran ini berhenti karena kesalahan. */
  error?: string;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

/** Kemajuan pekerjaan panjang (mis. pembuatan gambar), persen berupa perkiraan. */
export type Progress = {
  percent: number;
  elapsedSec: number;
  etaSec: number;
};

/** Kejadian yang dialirkan server ke browser selama satu giliran. */
export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "status"; text: string }
  | { type: "progress"; progress: Progress }
  | { type: "image"; image: GeneratedImage }
  | { type: "document"; doc: GeneratedDoc }
  | { type: "error"; message: string }
  | { type: "done" };
