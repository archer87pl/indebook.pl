import type { SiteSection } from "@/lib/site-config";
import { sanitizeCustomHtml } from "@/lib/sanitize";

type CustomHtmlSection = Extract<SiteSection, { type: "customHtml" }>;

export default function CustomHtml({ section }: { section: CustomHtmlSection }) {
  if (!section.data.html.trim()) return null;
  return (
    <section className="py-8">
      <div
        className="mx-auto max-w-6xl px-4"
        dangerouslySetInnerHTML={{ __html: sanitizeCustomHtml(section.data.html) }}
      />
    </section>
  );
}
