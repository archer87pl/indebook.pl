"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";

const TITLES: [string, string][] = [
  ["/admin/rezerwacje/nowa", "Nowa rezerwacja"],
  ["/admin/rezerwacje", "Rezerwacje"],
  ["/admin/goscie", "Goście"],
  ["/admin/platnosci", "Płatności"],
  ["/admin/faktury", "Faktury"],
  ["/admin/kalendarz", "Kalendarz obłożenia"],
  ["/admin/kanaly", "Kanały sprzedaży"],
  ["/admin/pokoje", "Pokoje"],
  ["/admin/cennik", "Cennik"],
  ["/admin/opinie", "Opinie"],
  ["/admin/raporty", "Raporty"],
  ["/admin/obiekt", "Ustawienia obiektu"],
  ["/admin/plan", "Plan i abonament"],
  ["/admin", "Pulpit"],
];

function titleFor(pathname: string) {
  return TITLES.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Panel";
}

/** Topbar panelu wg 1c: tytuł strony + data, wyszukiwarka, CTA „Nowa rezerwacja". */
export default function AdminTopbar({ today }: { today: string }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 flex h-[58px] flex-none items-center gap-3 border-b border-slate-200 bg-white px-4 lg:px-6 print:hidden">
      <div className="min-w-0">
        <div className="truncate text-base font-bold tracking-[-0.01em]">
          {titleFor(pathname)}
        </div>
        <div className="-mt-px truncate text-[11px] font-medium text-slate-500">
          {today}
        </div>
      </div>
      <form
        action="/admin/rezerwacje"
        className="ml-2 hidden max-w-[300px] flex-1 md:block"
        role="search"
      >
        <div className="flex h-9 items-center gap-2 rounded-[10px] bg-slate-100 px-3 text-slate-400 focus-within:ring-2 focus-within:ring-brand-600/30">
          <Search size={15} strokeWidth={2} />
          <input
            type="search"
            name="q"
            placeholder="Szukaj rezerwacji, gościa…"
            className="w-full bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
      </form>
      <Link href="/admin/rezerwacje/nowa" className="btn-primary ml-auto h-9 px-4 py-0 text-[13px]">
        <Plus size={14} strokeWidth={2.4} />
        <span className="hidden sm:inline">Nowa rezerwacja</span>
      </Link>
    </header>
  );
}
