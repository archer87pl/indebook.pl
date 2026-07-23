import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";

type HeroSection = Extract<SiteSection, { type: "hero" }>;

export default function Hero({ section, ctx }: { section: HeroSection; ctx: SiteCtx }) {
  const photo =
    ctx.property.photos.find((p) => p.id === section.data.photoId) ?? ctx.property.photos[0];
  return (
    <section id="top" className="relative flex min-h-[70vh] items-center justify-center overflow-hidden">
      {photo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={photo.path}
          alt={ctx.property.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative mx-auto max-w-3xl px-4 py-24 text-center text-white">
        <h1 className="text-4xl font-bold leading-tight drop-shadow sm:text-5xl">
          {section.data.headline || ctx.property.name}
        </h1>
        {section.data.tagline && (
          <p className="mt-4 text-lg text-white/90 drop-shadow">{section.data.tagline}</p>
        )}
        <a
          href={`${ctx.appUrl}/o/${ctx.property.slug}`}
          className="mt-8 inline-block rounded-full bg-[var(--site-primary)] px-8 py-3.5 text-base font-semibold text-[var(--site-primary-text)] shadow-lg transition-transform hover:scale-[1.03]"
        >
          {section.data.ctaLabel || "Zarezerwuj pobyt"}
        </a>
      </div>
    </section>
  );
}
