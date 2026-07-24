"use client";

// Przełącznik języka interfejsu gościa. Zmienia tę samą ścieżkę na inny język
// (next-intl dokłada prefiks i zapisuje cookie NEXT_LOCALE).

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { pl: "PL", en: "EN", de: "DE" };

export default function LangSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Język / Language">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => router.replace(pathname, { locale: l })}
          aria-current={l === locale ? "true" : undefined}
          className={`rounded-[7px] px-2 py-1 text-[12px] font-bold transition-colors ${
            l === locale
              ? "bg-brand-100 text-brand-800"
              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          }`}
        >
          {LABELS[l] ?? l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
