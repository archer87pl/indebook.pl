import Link from "next/link";
import Logo from "@/components/Logo";

/**
 * Layout stron auth wg 12a: split — lewa kolumna brandowa na ciemnej zieleni
 * (logo, hasło, statystyki), prawa z wyśrodkowaną treścią formularza.
 */
export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen">
      <aside className="relative hidden w-[440px] flex-none flex-col overflow-hidden bg-brand-900 p-10 text-white lg:flex">
        <Link href="/" aria-label="Rezio — strona główna">
          <Logo size={40} tone="dark" />
        </Link>
        <div className="mt-auto">
          <h2 className="text-[28px] font-bold leading-[1.15] tracking-[-0.025em]">
            Twoja recepcja
            <br />w jednym miejscu.
          </h2>
          <p className="mt-3.5 max-w-[320px] text-sm leading-relaxed text-[#a7cbb9]">
            Rezerwacje, kalendarz obłożenia, płatności BLIK i meldunek online —
            bez prowizji portali.
          </p>
          <div className="mt-6 flex gap-6">
            <div>
              <div className="nums text-[22px] font-bold">0%</div>
              <div className="text-[11px] text-[#8fb5a2]">prowizji</div>
            </div>
            <div>
              <div className="nums text-[22px] font-bold">30 min</div>
              <div className="text-[11px] text-[#8fb5a2]">na start</div>
            </div>
            <div>
              <div className="nums text-[22px] font-bold">24/7</div>
              <div className="text-[11px] text-[#8fb5a2]">rezerwacje online</div>
            </div>
          </div>
        </div>
        <div className="absolute -bottom-[70px] -right-[70px] h-[220px] w-[220px] rounded-full bg-brand-400/10" />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col items-center justify-center bg-white px-6 py-10">
        <Link href="/" className="mb-8 lg:hidden" aria-label="Rezio — strona główna">
          <Logo size={34} ringColor="#ffffff" />
        </Link>
        <div className="w-full max-w-[340px]">{children}</div>
      </main>
    </div>
  );
}
