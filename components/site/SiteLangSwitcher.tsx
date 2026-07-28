"use client";

// Przełącznik języka na stronie WWW obiektu: zapisuje cookie SITE_LOCALE
// i odświeża stronę (te strony są poza routingiem next-intl).

import { useState } from "react";
import { routing } from "@/i18n/routing";

const LABELS: Record<string, string> = { pl: "PL", en: "EN", de: "DE" };

export default function SiteLangSwitcher({ current }: { current: string }) {
  const [busy, setBusy] = useState(false);

  async function pick(locale: string) {
    if (locale === current || busy) return;
    setBusy(true);
    try {
      await fetch("/api/sites/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      window.location.reload();
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Language">
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          disabled={busy}
          aria-current={l === current ? "true" : undefined}
          className={`rounded-[7px] px-1.5 py-1 text-[11px] font-bold transition-opacity disabled:opacity-50 ${
            l === current
              ? "bg-[var(--site-primary)] text-[var(--site-primary-text)]"
              : "text-[var(--site-muted)] hover:text-[var(--site-text)]"
          }`}
        >
          {LABELS[l] ?? l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
