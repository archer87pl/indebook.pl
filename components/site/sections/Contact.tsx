import { Clock, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";
import InquiryForm from "./InquiryForm";

type ContactSection = Extract<SiteSection, { type: "contact" }>;

// Mapa: Google Maps embed bez klucza API (adres tekstowy).
export default async function Contact({ section, ctx }: { section: ContactSection; ctx: SiteCtx }) {
  const t = await getTranslations({ locale: ctx.locale, namespace: "site" });
  const p = ctx.property;
  return (
    <section id="contact" className="scroll-mt-20 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-2 text-center text-3xl font-bold">{section.data.title}</h2>
        {section.data.intro && (
          <p className="mx-auto mb-8 max-w-2xl text-center text-[var(--site-muted)]">
            {section.data.intro}
          </p>
        )}
        <div className="grid items-start gap-8 md:grid-cols-2">
          <div className="space-y-5">
            <div className="space-y-3 text-sm">
              {p.address && (
                <p className="flex items-center gap-2.5">
                  <MapPin size={16} strokeWidth={2} className="flex-none text-[var(--site-primary)]" />
                  {p.address}
                </p>
              )}
              <p className="flex items-center gap-2.5 text-[var(--site-muted)]">
                <Clock size={16} strokeWidth={2} className="flex-none text-[var(--site-primary)]" />
                {t("contact.checkInOut", { from: p.checkInFrom, to: p.checkOutTo })}
              </p>
            </div>
            <InquiryForm
              siteKey={ctx.siteKey}
              labels={{
                name: t("contact.name"),
                email: t("contact.email"),
                phone: t("contact.phone"),
                message: t("contact.message"),
                send: t("contact.send"),
                sentTitle: t("contact.sentTitle"),
                sentBody: t("contact.sentBody"),
                error: t("contact.error"),
              }}
            />
          </div>
          {p.address && (
            <div className="overflow-hidden rounded-2xl border border-[var(--site-text)]/10">
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(p.address)}&output=embed`}
                title={t("contact.mapTitle", { address: p.address })}
                loading="lazy"
                className="h-72 w-full"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
