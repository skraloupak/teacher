import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Slovíčka – angličtina",
  description: "Kartičky na učení anglických slovíček a frází s opakováním toho, co mi nejde.",
  applicationName: "Slovíčka",
  appleWebApp: { capable: true, title: "Slovíčka", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Přiblížení prsty necháváme zapnuté; dvojklik řeší touch-action v globals.css.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e14" },
  ],
};

/** Nastaví téma dřív, než se stránka vykreslí – jinak by tmavý režim problikl bíle. */
const themeScript = `(function(){try{var s=localStorage.getItem("teacher-app:theme");var d=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.dataset.theme=(s==="dark"||s==="light")?s:(d?"dark":"light");}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="cs" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  );
}
