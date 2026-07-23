import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";
import GalleryLightbox from "./GalleryLightbox";

type GallerySection = Extract<SiteSection, { type: "gallery" }>;

export default function Gallery({ section, ctx }: { section: GallerySection; ctx: SiteCtx }) {
  const photos = ctx.property.photos.map((p) => ({ id: p.id, path: p.path }));
  if (photos.length === 0) return null;
  return (
    <section id="gallery" className="scroll-mt-20 py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-8 text-center text-3xl font-bold">{section.data.title}</h2>
        <GalleryLightbox photos={photos} alt={ctx.property.name} />
      </div>
    </section>
  );
}
