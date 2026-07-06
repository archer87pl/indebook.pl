import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { appUrl } from "@/lib/payments";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: {
    default: "Notelo — rezerwacje online bez prowizji",
    template: "%s | Notelo",
  },
  description:
    "System rezerwacji dla obiektów noclegowych: silnik rezerwacji, channel manager, płatności online i panel recepcji. Abonament zamiast prowizji.",
  openGraph: {
    siteName: "Notelo",
    locale: "pl_PL",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200/80">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid place-items-center h-8 w-8 rounded-lg bg-brand-700 text-white font-black text-sm">
                H
              </span>
              <span className="text-xl font-bold tracking-tight text-brand-950">
                host<span className="text-brand-600">imo</span>
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
              <Link href="/moja-rezerwacja" className="hover:text-brand-700">
                Moja rezerwacja
              </Link>
              <Link href="/admin" className="hover:text-brand-700">
                Panel obiektu
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">{children}</main>
        <footer className="bg-brand-950 text-brand-100/70 mt-12">
          <div className="max-w-5xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
            <div className="space-y-2">
              <p className="flex items-center gap-2">
                <span className="grid place-items-center h-7 w-7 rounded-lg bg-white/10 text-white font-black text-xs">
                  H
                </span>
                <span className="text-lg font-bold text-white">
                  host<span className="text-brand-400">imo</span>
                </span>
              </p>
              <p className="text-xs leading-relaxed">
                System rezerwacji bez prowizji dla pensjonatów, willi i apartamentów.
                Twoi goście rezerwują bezpośrednio u Ciebie.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-100/50">
                Dla obiektów
              </p>
              <ul className="space-y-1.5">
                <li><Link href="/rejestracja" className="hover:text-white">Zarejestruj obiekt</Link></li>
                <li><Link href="/#cennik" className="hover:text-white">Cennik</Link></li>
                <li><Link href="/#faq" className="hover:text-white">Najczęstsze pytania</Link></li>
                <li><Link href="/login" className="hover:text-white">Panel obiektu</Link></li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-100/50">
                Dla gości
              </p>
              <ul className="space-y-1.5">
                <li><Link href="/#obiekty" className="hover:text-white">Przeglądaj obiekty</Link></li>
                <li><Link href="/moja-rezerwacja" className="hover:text-white">Moja rezerwacja</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/10 text-center text-xs py-4">
            © {new Date().getFullYear()} Notelo · notelo.pl — rezerwuj bezpośrednio, bez prowizji portali
          </div>
        </footer>
      </body>
    </html>
  );
}
