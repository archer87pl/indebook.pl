import { getTranslations } from "next-intl/server";
import { PRODUCT_NAME } from "@/lib/brand";
import { localePath } from "@/lib/locale-urls";
import type { SiteCtx } from "./SiteRenderer";

export default async function SiteFooter({ ctx }: { ctx: SiteCtx }) {
  const t = await getTranslations({ locale: ctx.locale, namespace: "site" });
  const p = ctx.property;
  const propertyPath = localePath(`/o/${p.slug}`, ctx.locale);

  return (
    <footer className="border-t border-[var(--site-text)]/10 py-10">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 text-sm text-[var(--site-muted)] sm:grid-cols-3">
        <div>
          <p className="mb-1 font-bold text-[var(--site-text)]">{p.name}</p>
          {p.address && <p>{p.address}</p>}
        </div>
        <div>
          <p>{t("footer.checkInFrom", { time: p.checkInFrom })}</p>
          <p>{t("footer.checkOutTo", { time: p.checkOutTo })}</p>
        </div>
        <div className="space-y-1">
          {(p.terms || p.privacyPolicy) && (
            <p>
              <a
                href={`${ctx.appUrl}${propertyPath}/regulamin`}
                className="underline-offset-2 hover:underline"
              >
                {t("footer.terms")}
              </a>
            </p>
          )}
          <p>
            {t("footer.bookings")}{" "}
            <a href={`${ctx.appUrl}${propertyPath}`} className="underline-offset-2 hover:underline">
              {t("footer.bookingsLink")}
            </a>
          </p>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-[var(--site-muted)]">
        {t("footer.madeWith")}{" "}
        <a href={ctx.appUrl} className="font-semibold underline-offset-2 hover:underline">
          {PRODUCT_NAME}
        </a>
      </p>
    </footer>
  );
}
