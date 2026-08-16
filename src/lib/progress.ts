import type { Progress, StreamEvent } from "@/lib/types";

/**
 * Kabar kemajuan berbasis waktu.
 *
 * Penyedia tidak melaporkan kemajuan sebenarnya, jadi persennya diperkirakan
 * dari waktu berjalan terhadap durasi tipikal yang sudah diukur. Kurvanya
 * melambat mendekati akhir dan berhenti di 95% supaya tidak pernah menjanjikan
 * "selesai" sebelum hasilnya benar-benar ada.
 */

/** Durasi tipikal tiap tahap, dari pengukuran nyata di produksi (detik). */
export const EXPECTED_SEC = {
  jawaban: 8,
  pencarian: 15,
  gambar: 11,
  berkas: 3,
} as const;

export type ProgressReporter = {
  /** Ganti keterangan tahap dan perkiraan durasinya. */
  phase(label: string, expectedSec: number): void;
  /** Hentikan pelaporan; kalau `finish` diisi, kirim 100% lebih dulu. */
  stop(finish?: boolean): void;
};

export function startProgress(
  send: (event: StreamEvent) => void,
  label: string,
  expectedSec: number,
  intervalMs = 600,
): ProgressReporter {
  const startedAt = Date.now();
  let currentLabel = label;
  let expected = expectedSec;
  // Persen tidak pernah mundur, meski perkiraan durasinya diperpanjang
  // di tengah jalan karena tahapnya berubah.
  let floor = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  const emit = (percentOverride?: number) => {
    const elapsed = (Date.now() - startedAt) / 1000;
    const curve = Math.round(100 * (1 - Math.exp(-elapsed / (expected / 2))));
    const percent = percentOverride ?? Math.max(floor, Math.min(95, curve));
    if (percentOverride === undefined) floor = percent;

    const progress: Progress = {
      percent,
      elapsedSec: Math.round(elapsed),
      etaSec: Math.max(0, Math.round(expected - elapsed)),
      label: currentLabel,
    };
    send({ type: "progress", progress });
  };

  emit();
  timer = setInterval(emit, intervalMs);

  return {
    phase(nextLabel, nextExpected) {
      currentLabel = nextLabel;
      expected = Math.max(nextExpected, (Date.now() - startedAt) / 1000 + 2);
      send({ type: "status", text: nextLabel });
      emit();
    },
    stop(finish = false) {
      if (timer) clearInterval(timer);
      timer = null;
      if (finish) emit(100);
    },
  };
}
