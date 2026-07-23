import { AMENITIES, parseAmenities } from "@/lib/amenities";
import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";

type AmenitiesSection = Extract<SiteSection, { type: "amenities" }>;

export default function Amenities({ section, ctx }: { section: AmenitiesSection; ctx: SiteCtx }) {
  // Suma udogodnień wszystkich typów pokoi — bez duplikatów, w kolejności AMENITIES.
  const keys = new Set(ctx.property.unitTypes.flatMap((ut) => parseAmenities(ut.amenities)));
  const defs = AMENITIES.filter((a) => keys.has(a.key));
  if (defs.length === 0) return null;
  return (
    <section id="amenities" className="scroll-mt-20 bg-[var(--site-surface)] py-16">
      <div className="mx-auto max-w-4xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">{section.data.title}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {defs.map((a) => (
            <div
              key={a.key}
              className="flex items-center gap-3 rounded-xl border border-[var(--site-text)]/10 bg-[var(--site-bg)] px-4 py-3"
            >
              <span className="text-xl">{a.icon}</span>
              <span className="text-sm font-medium">{a.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
