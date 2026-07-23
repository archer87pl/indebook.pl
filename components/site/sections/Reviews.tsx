import { Star } from "lucide-react";
import { prisma } from "@/lib/db";
import { averageRating } from "@/lib/reviews";
import { formatDatePl } from "@/lib/dates";
import type { SiteSection } from "@/lib/site-config";
import type { SiteCtx } from "../SiteRenderer";

type ReviewsSection = Extract<SiteSection, { type: "reviews" }>;

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-px text-[var(--site-accent)]" aria-label={`${value} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={14}
          strokeWidth={2}
          fill={i < Math.round(value) ? "currentColor" : "none"}
          className={i < Math.round(value) ? "" : "opacity-30"}
        />
      ))}
    </span>
  );
}

export default async function Reviews({ section, ctx }: { section: ReviewsSection; ctx: SiteCtx }) {
  const reviews = await prisma.review.findMany({
    where: { propertyId: ctx.property.id, hidden: false },
    orderBy: { createdAt: "desc" },
    take: 9,
  });
  if (reviews.length === 0) return null;
  const avg = averageRating(reviews.map((r) => r.rating));
  return (
    <section id="reviews" className="scroll-mt-20 bg-[var(--site-surface)] py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-2 text-center text-3xl font-bold">{section.data.title}</h2>
        <p className="mb-8 flex items-center justify-center gap-2 text-sm text-[var(--site-muted)]">
          <Stars value={avg} />
          {avg.toFixed(1).replace(".", ",")} / 5 · {reviews.length} opinii
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className="space-y-2 rounded-2xl border border-[var(--site-text)]/10 bg-[var(--site-bg)] p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{rev.authorName}</span>
                <Stars value={rev.rating} />
              </div>
              <p className="text-xs text-[var(--site-muted)]">
                {formatDatePl(rev.createdAt.toISOString().slice(0, 10))}
              </p>
              {rev.comment && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--site-muted)]">
                  {rev.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
