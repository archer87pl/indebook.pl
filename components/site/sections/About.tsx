import type { SiteSection } from "@/lib/site-config";
import { sanitizeRichText } from "@/lib/sanitize";

type AboutSection = Extract<SiteSection, { type: "about" }>;

export default function About({ section }: { section: AboutSection }) {
  if (!section.data.html) return null;
  return (
    <section id="about" className="scroll-mt-20 py-16">
      <div className="mx-auto max-w-3xl px-4">
        <h2 className="mb-6 text-center text-3xl font-bold">{section.data.title}</h2>
        <div
          className="site-prose space-y-4 text-[15.5px] leading-relaxed text-[var(--site-muted)] [&_a]:underline [&_b]:text-[var(--site-text)] [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-[var(--site-text)] [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-[var(--site-text)]"
          dangerouslySetInnerHTML={{ __html: sanitizeRichText(section.data.html) }}
        />
      </div>
    </section>
  );
}
