import { Users } from "lucide-react";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { formatPln } from "@/lib/format";
import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";

type UnitsSection = Extract<SiteSection, { type: "units" }>;

export default function Units({ section, ctx }: { section: UnitsSection; ctx: SiteCtx }) {
  const unitTypes = ctx.property.unitTypes;
  if (unitTypes.length === 0) return null;
  return (
    <section id="units" className="scroll-mt-20 bg-[var(--site-surface)] py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">{section.data.title}</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {unitTypes.map((ut) => {
            const amenityDefs = AMENITIES.filter((a) =>
              parseAmenities(ut.amenities).includes(a.key)
            );
            return (
              <div
                key={ut.id}
                className="overflow-hidden rounded-2xl border border-[var(--site-text)]/10 bg-[var(--site-bg)] shadow-sm transition-shadow hover:shadow-md"
              >
                {ut.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={ut.photos[0].path}
                    alt={ut.name}
                    loading="lazy"
                    className="h-52 w-full object-cover"
                  />
                ) : (
                  <div className="h-52 w-full bg-[var(--site-text)]/5" />
                )}
                <div className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-lg font-bold">{ut.name}</h3>
                    <div className="text-right">
                      <div className="whitespace-nowrap text-lg font-bold text-[var(--site-primary)]">
                        {formatPln(ut.basePriceGr)}
                      </div>
                      <div className="text-xs text-[var(--site-muted)]">za noc</div>
                    </div>
                  </div>
                  <p className="flex items-center gap-1.5 text-sm text-[var(--site-muted)]">
                    <Users size={15} strokeWidth={2} />
                    do {ut.maxGuests} os.
                    {ut.minStay > 1 && ` · min. ${ut.minStay} nocy`}
                  </p>
                  {ut.description && (
                    <p className="line-clamp-3 text-sm leading-relaxed text-[var(--site-muted)]">
                      {ut.description}
                    </p>
                  )}
                  {amenityDefs.length > 0 && (
                    <p className="flex flex-wrap gap-1.5">
                      {amenityDefs.slice(0, 5).map((a) => (
                        <span
                          key={a.key}
                          className="rounded-md bg-[var(--site-text)]/5 px-2 py-0.5 text-[11px] font-medium text-[var(--site-muted)]"
                        >
                          {a.icon} {a.label}
                        </span>
                      ))}
                    </p>
                  )}
                  <a
                    href={`${ctx.appUrl}/o/${ctx.property.slug}/pokoj/${ut.id}`}
                    className="mt-1 inline-block w-full rounded-full bg-[var(--site-primary)] px-5 py-2.5 text-center text-sm font-semibold text-[var(--site-primary-text)] transition-opacity hover:opacity-90"
                  >
                    Zobacz i zarezerwuj
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
