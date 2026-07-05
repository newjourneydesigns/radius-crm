import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Atkinson_Hyperlegible({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Scorekeeper",
  description:
    "Choose any game. The AI does the rest — scoresheets, rules, and history through plain conversation.",
};

export const viewport: Viewport = {
  themeColor: "#0C2B1C",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${display.variable} ${body.variable} font-body text-ink antialiased`}
      >
        <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
          <header className="flex items-center justify-between py-4">
            <Link
              href="/"
              className="font-display text-lg font-bold tracking-tight text-ink"
            >
              Score<span className="text-gold">keeper</span>
            </Link>
            <nav className="flex gap-5 text-sm text-ink-dim">
              <Link href="/" className="hover:text-ink">
                Table
              </Link>
              <Link href="/history" className="hover:text-ink">
                History
              </Link>
            </nav>
          </header>
          <main className="flex flex-1 flex-col pb-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
