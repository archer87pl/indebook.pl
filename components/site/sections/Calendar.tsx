import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";
import AvailabilityCalendar from "./AvailabilityCalendar";

type CalendarSectionType = Extract<SiteSection, { type: "calendar" }>;

export default function CalendarSection({
  section,
  ctx,
}: {
  section: CalendarSectionType;
  ctx: SiteCtx;
}) {
  const unitTypes = ctx.property.unitTypes.map((ut) => ({ id: ut.id, name: ut.name }));
  if (unitTypes.length === 0) return null;
  return (
    <section id="calendar" className="scroll-mt-20 bg-[var(--site-surface)] py-16">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">{section.data.title}</h2>
        <AvailabilityCalendar
          unitTypes={unitTypes}
          appUrl={ctx.appUrl}
        />
      </div>
    </section>
  );
}
