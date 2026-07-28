// Słowniki trzymamy w plikach per namespace (messages/<locale>/<namespace>.json),
// żeby dokładanie kolejnych powierzchni nie oznaczało edycji jednego wielkiego
// pliku. Tu składamy je w jeden obiekt komunikatów dla next-intl.

import type { AppLocale } from "./routing";

// Lista namespace'ów — dodając nowy plik JSON, dopisz go tutaj (jawna lista
// zamiast dynamicznego czytania katalogu: działa w bundlerze i na Vercelu).
export const NAMESPACES = [
  "nav",
  "common",
  "property",
  "search",
  "booking",
  "guest",
  "checkin",
  "review",
  "account",
  "site",
  "email",
] as const;

export async function loadMessages(locale: AppLocale): Promise<Record<string, unknown>> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = await import(`../messages/${locale}/${ns}.json`);
      return [ns, mod.default] as const;
    })
  );
  return Object.fromEntries(entries);
}
