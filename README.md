# Somat

**AI Chat Indonesia — teks & gambar.** Satu layar chat sederhana yang bisa menjawab
pertanyaan, membaca dokumen yang diunggah, membuat gambar, dan menyusun berkas
Word, Excel, PowerPoint, serta PDF.

Dibuat untuk dijalankan di <https://somat.rominur.com>.

---

## Prinsip

- **Sederhana di depan.** Yang terlihat pengguna hanya kolom chat. Tidak ada
  pemilih model, tidak ada pengaturan API, tidak ada mode-mode terpisah.
- **Kemampuan muncul saat dibutuhkan.** Minta gambar → gambar dibuat. Minta
  Excel → berkasnya langsung bisa diunduh. Semua lewat percakapan biasa.
- **Kunci di server.** `OPENROUTER_API_KEY` hanya dibaca di sisi server; browser
  tidak pernah menerimanya. Nama model juga tidak pernah dikirim ke browser.
- **Riwayat milik pengguna.** Percakapan tersimpan di IndexedDB peramban
  masing-masing. Tidak ada basis data di server.

## Kemampuan

| Kebutuhan | Yang terjadi |
| --- | --- |
| Tanya jawab, menulis, menganalisis | Jawaban mengalir langsung (streaming), lengkap dengan Markdown, tabel, blok kode, dan rumus LaTeX |
| "Buatkan gambar …" | Gambar dibuat lalu tampil di percakapan dengan tombol unduh |
| "Buatkan Word/Excel/PowerPoint/PDF …" | Berkas disusun di server, muncul sebagai kartu unduhan |
| Jawaban apa pun | Tombol **Simpan sebagai** mengubah jawaban jadi .docx / .xlsx / .pptx / .pdf |
| Unggah dokumen | PDF, Word (.docx/.doc), Excel (.xlsx/.xls/.csv), PowerPoint (.pptx), OpenDocument (.odt/.ods/.odp), HTML, teks, dan berkas kode dibaca isinya |
| Unggah gambar / PDF pindaian | **OCR dijalankan di browser** (Bahasa Indonesia + Inggris), lalu teksnya ikut dikirim |

### Gaya presentasi

Setiap PowerPoint disusun mengikuti pola konsultan strategi (McKinsey/Gartner):
ringkasan eksekutif di depan, satu pesan per slide, judul berupa *action title*
(kalimat kesimpulan, bukan label topik), isi maksimal lima poin yang MECE,
kicker "so what" di pita bawah, baris sumber, dan slide penutup berisi
rekomendasi.

## Jalankan lokal

```bash
npm install
cp .env.example .env.local   # isi OPENROUTER_API_KEY
npm run dev
```

Buka <http://localhost:3000>.

## Variabel lingkungan

Wajib satu saja:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Sisanya opsional dan sudah ada nilai bawaan — lihat [.env.example](.env.example)
untuk daftar lengkap (pemilihan model, batas pemakaian, batas unggahan).

### Batas pemakaian

Situs ini terbuka tanpa login, jadi ada penghitung kuota per alamat IP dan kuota
gambar harian untuk seluruh situs. Nilai bawaan:

| Batas | Bawaan |
| --- | --- |
| Chat per IP | 20 per 5 menit, 300 per hari |
| Gambar per IP | 5 per 10 menit, 20 per hari |
| Gambar seluruh situs | 100 per hari |
| Unggahan | 5 berkas, maksimal 12 MB per berkas |

Tanpa Upstash, penghitung disimpan di memori tiap instance serverless, sehingga
batas efektifnya bisa lebih longgar dari angka di atas. Untuk kuota yang persis,
isi `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.

## Deploy ke Vercel

1. Push repositori ini ke GitHub.
2. Di Vercel: **Add New → Project**, pilih repositorinya, biarkan preset Next.js.
3. Tambahkan Environment Variable `OPENROUTER_API_KEY` (Production, Preview,
   Development), lalu Deploy.
4. **Settings → Domains** → tambahkan `somat.rominur.com`.
5. Di DNS `rominur.com`, tambahkan rekaman yang diminta Vercel:

   ```
   CNAME   somat   cname.vercel-dns.com.
   ```

6. Tunggu sertifikat TLS terbit (biasanya beberapa menit).

Pembuatan gambar bisa memakan waktu sampai sekitar satu menit. Rute API sudah
meminta `maxDuration` 300 detik; pastikan paket Vercel yang dipakai mengizinkan
durasi tersebut, atau turunkan kualitas gambar bawaan.

## Struktur

```
src/app/api/chat     alur percakapan + pemanggilan alat (gambar & dokumen)
src/app/api/upload   ekstraksi teks dari berkas yang diunggah
src/app/api/export   pembuatan berkas .docx / .xlsx / .pptx / .pdf
src/lib/docgen       parser Markdown dan pembangun tiap format berkas
src/lib/ocr.ts       OCR di sisi peramban (tesseract.js + pdf.js)
src/components       antarmuka chat
```

## Catatan teknis

- PDF dibuat dengan pdf-lib memakai font standar PDF, jadi tidak ada berkas font
  yang perlu ikut ke serverless. Karakter di luar Latin-1 (aksara CJK, emoji)
  diganti agar proses tidak gagal.
- Berkas worker pdf.js disalin ke `public/` lewat `npm run prepare-assets`, yang
  otomatis dijalankan sebelum `dev` dan `build`.
- Data pelatihan OCR diunduh tesseract.js dari CDN saat pertama kali dipakai.
