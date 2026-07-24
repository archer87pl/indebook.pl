// Layout interfejsu gościa (PL/EN/DE). Prostszy chrome niż landing: logo,
// przełącznik języka i wejście do „Moja rezerwacja". Panel recepcji i landing
// mają własne layouty i zostają po polsku.

import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Logo from "@/components/Logo";
import LangSwitcher from "@/components/LangSwitcher";
import HtmlLangSync from "@/components/HtmlLangSync";
import { Link } from "@/i18n/navigation";
import { isAppLocale, routing } from "@/i18n/routing";
import { PRODUCT_DOMAIN, PRODUCT_NAME } from "@/lib/brand";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("nav");

  return (
    <NextIntlClientProvider>
      <HtmlLangSync locale={locale} />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label={PRODUCT_NAME}>
            <Logo size={31} ringColor="#ffffff" />
          </Link>
          <div className="flex items-center gap-2.5">
            <Link
              href="/moja-rezerwacja"
              className="rounded-[10px] border border-slate-300 px-3.5 py-2 text-[13.5px] font-semibold text-brand-900 transition-colors hover:bg-slate-100"
            >
              {t("myReservation")}
            </Link>
            <LangSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="mt-12 bg-brand-900 py-6 text-center text-xs text-slate-400 print:hidden">
        © {new Date().getFullYear()} {PRODUCT_NAME} · {PRODUCT_DOMAIN} — {t("tagline")}
      </footer>
    </NextIntlClientProvider>
  );
}
