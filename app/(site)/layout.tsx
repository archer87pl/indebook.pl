import Link from "next/link";
import Logo from "@/components/Logo";

export default function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <Link href="/" aria-label="Rezio — strona główna">
            <Logo size={31} ringColor="#ffffff" />
          </Link>
          <nav className="hidden items-center gap-1 text-[13.5px] font-medium text-slate-600 md:flex">
            <Link href="/#funkcje" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              Funkcje
            </Link>
            <Link href="/#jak-to-dziala" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              Jak to działa
            </Link>
            <Link href="/#cennik" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              Cennik
            </Link>
            <Link href="/blog" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              Blog
            </Link>
            <Link href="/#faq" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              FAQ
            </Link>
            <Link href="/moja-rezerwacja" className="rounded-[9px] px-3 py-2 hover:bg-slate-100">
              Moja rezerwacja
            </Link>
          </nav>
          <div className="flex items-center gap-2.5">
            <Link
              href="/admin"
              className="rounded-[10px] border border-slate-300 px-3.5 py-2 text-[13.5px] font-semibold text-brand-900 transition-colors hover:bg-slate-100"
            >
              Panel obiektu
            </Link>
            <Link
              href="/rejestracja"
              className="hidden rounded-[10px] bg-brand-900 px-4 py-2 text-[13.5px] font-bold text-white transition-colors hover:bg-brand-950 sm:block"
            >
              Zarejestruj obiekt
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">{children}</main>
      <footer className="bg-brand-900 text-slate-300 mt-12 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-10 grid gap-8 sm:grid-cols-3 text-sm">
          <div className="space-y-3">
            <Logo size={28} tone="dark" />
            <p className="text-xs leading-relaxed text-slate-400">
              System rezerwacji bez prowizji dla pensjonatów, willi i apartamentów.
              Twoi goście rezerwują bezpośrednio u Ciebie.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300/60">
              Dla obiektów
            </p>
            <ul className="space-y-1.5">
              <li><Link href="/rejestracja" className="hover:text-white">Zarejestruj obiekt</Link></li>
              <li><Link href="/#cennik" className="hover:text-white">Cennik</Link></li>
              <li><Link href="/blog" className="hover:text-white">Blog</Link></li>
              <li><Link href="/#faq" className="hover:text-white">Najczęstsze pytania</Link></li>
              <li><Link href="/login" className="hover:text-white">Panel obiektu</Link></li>
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-300/60">
              Dla gości
            </p>
            <ul className="space-y-1.5">
              <li><Link href="/moja-rezerwacja" className="hover:text-white">Moja rezerwacja</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 text-center text-xs py-4 text-slate-400">
          © {new Date().getFullYear()} Rezio · rezio.pl — rezerwuj bezpośrednio, bez prowizji portali
        </div>
      </footer>
    </>
  );
}
