import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Somat — AI Chat Indonesia",
  description:
    "Somat: AI chat Indonesia untuk teks dan gambar. Bisa membaca dokumen yang kamu unggah, membuat gambar, serta menyusun berkas Word, Excel, PowerPoint, dan PDF.",
  applicationName: "Somat",
  openGraph: {
    title: "Somat — AI Chat Indonesia",
    description:
      "AI chat Indonesia untuk teks dan gambar, lengkap dengan pembuatan dokumen Word, Excel, PowerPoint, dan PDF.",
    url: "https://somat.rominur.com",
    siteName: "Somat",
    locale: "id_ID",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1420" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

/** Terapkan tema sebelum render pertama supaya tidak ada kedipan warna. */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("somat.theme");var d=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
