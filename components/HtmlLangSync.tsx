"use client";

// <html lang> renderuje root layout, który przy nawigacji klienckiej między
// językami się nie przerysowuje (jest wspólny dla wszystkich tras). Ten
// komponent utrzymuje atrybut zgodny z aktywnym językiem po stronie klienta.

import { useEffect } from "react";

export default function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    if (document.documentElement.lang !== locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);
  return null;
}
