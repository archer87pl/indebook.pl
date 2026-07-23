import { MapPin } from "lucide-react";
import type { SiteSection } from "@/lib/site-config";

type AttractionsSection = Extract<SiteSection, { type: "attractions" }>;

export default function Attractions({ section }: { section: AttractionsSection }) {
  if (section.data.items.length === 0) return null;
  return (
    <section id="attractions" className="scroll-mt-20 py-16">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">{section.data.title}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.data.items.map((item, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[var(--site-text)]/10 bg-[var(--site-surface)] p-5"
            >
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <h3 className="font-bold">{item.name}</h3>
                {item.distance && (
                  <span className="flex flex-none items-center gap-1 text-xs text-[var(--site-muted)]">
                    <MapPin size={12} strokeWidth={2} />
                    {item.distance}
                  </span>
                )}
              </div>
              {item.desc && (
                <p className="text-sm leading-relaxed text-[var(--site-muted)]">{item.desc}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
