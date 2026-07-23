import { Clock, MapPin } from "lucide-react";
import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";
import InquiryForm from "./InquiryForm";

type ContactSection = Extract<SiteSection, { type: "contact" }>;

// Mapa: Google Maps embed bez klucza API (adres tekstowy).
export default function Contact({ section, ctx }: { section: ContactSection; ctx: SiteCtx }) {
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
                zameldowanie od {p.checkInFrom} · wymeldowanie do {p.checkOutTo}
              </p>
            </div>
            <InquiryForm siteKey={ctx.siteKey} />
          </div>
          {p.address && (
            <div className="overflow-hidden rounded-2xl border border-[var(--site-text)]/10">
              <iframe
                src={`https://maps.google.com/maps?q=${encodeURIComponent(p.address)}&output=embed`}
                title={`Mapa: ${p.address}`}
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
