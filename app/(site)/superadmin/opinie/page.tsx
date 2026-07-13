import Link from "next/link";
import { Eye, EyeOff, Star } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { superToggleReviewHidden } from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";
import { formatDatePl } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-px text-accent-400" aria-label={`${value} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          strokeWidth={2}
          fill={i < value ? "currentColor" : "none"}
          className={i < value ? "" : "text-slate-300"}
        />
      ))}
    </span>
  );
}

/**
 * Globalna moderacja opinii: podgląd wszystkich opinii platformy (łącznie
 * z ukrytymi) i nadrzędne ukrywanie/przywracanie ponad moderacją obiektu.
 */
export default async function SuperadminReviewsPage(props: {
  searchParams: Promise<{ filtr?: string }>;
}) {
  await requireSuperadmin();
  const sp = await props.searchParams;
  const onlyHidden = sp.filtr === "ukryte";

  const reviews = await prisma.review.findMany({
    where: onlyHidden ? { hidden: true } : {},
    include: {
      property: { select: { id: true, name: true, slug: true } },
      reservation: { select: { code: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const hiddenCount = reviews.filter((r) => r.hidden).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link
          href="/superadmin/opinie"
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold ${
            !onlyHidden
              ? "border border-brand-600 bg-brand-50 text-brand-700"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Wszystkie
        </Link>
        <Link
          href="/superadmin/opinie?filtr=ukryte"
          className={`rounded-[10px] px-3 py-1.5 text-[13px] font-semibold ${
            onlyHidden
              ? "border border-brand-600 bg-brand-50 text-brand-700"
              : "text-slate-500 hover:bg-slate-100"
          }`}
        >
          Ukryte
        </Link>
      </div>

      <Card>
        <CardHeader
          title="Opinie platformy"
          sub={`${reviews.length} ${onlyHidden ? "ukrytych" : "ostatnich"} opinii${!onlyHidden && hiddenCount > 0 ? ` (w tym ${hiddenCount} ukrytych)` : ""}`}
        />
        {reviews.length === 0 ? (
          <EmptyState
            icon={<Star size={26} strokeWidth={2} />}
            title={onlyHidden ? "Brak ukrytych opinii" : "Brak opinii"}
            description="Opinie pojawią się po pierwszych zakończonych pobytach."
          />
        ) : (
          <CardBody className="space-y-3">
            {reviews.map((rev) => (
              <div
                key={rev.id}
                className={`rounded-[11px] border p-3.5 ${
                  rev.hidden ? "border-danger-600/20 bg-danger-100/40" : "border-slate-200"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={rev.rating} />
                  <span className="text-[13px] font-semibold">{rev.authorName}</span>
                  <Link
                    href={`/superadmin/obiekt/${rev.property.id}`}
                    className="text-xs font-semibold text-brand-600 hover:underline"
                  >
                    {rev.property.name}
                  </Link>
                  <span className="tnum text-[10.5px] text-slate-400">
                    {rev.reservation.code} ·{" "}
                    {formatDatePl(rev.createdAt.toISOString().slice(0, 10))}
                  </span>
                  {rev.hidden && <Badge tone="danger">ukryta</Badge>}
                  <form action={superToggleReviewHidden} className="ml-auto">
                    <input type="hidden" name="id" value={rev.id} />
                    <button
                      className={`flex items-center gap-1.5 text-xs font-semibold hover:underline ${
                        rev.hidden ? "text-brand-600" : "text-danger-600"
                      }`}
                    >
                      {rev.hidden ? (
                        <>
                          <Eye size={13} strokeWidth={2} /> Przywróć
                        </>
                      ) : (
                        <>
                          <EyeOff size={13} strokeWidth={2} /> Ukryj
                        </>
                      )}
                    </button>
                  </form>
                </div>
                {rev.comment && (
                  <p className="mt-2 whitespace-pre-line text-[12.5px] text-slate-600">
                    {rev.comment}
                  </p>
                )}
                {rev.ownerReply && (
                  <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-[12.5px]">
                    <p className="text-xs font-semibold text-brand-700">Odpowiedź obiektu</p>
                    <p className="whitespace-pre-line text-slate-600">{rev.ownerReply}</p>
                  </div>
                )}
              </div>
            ))}
          </CardBody>
        )}
      </Card>
    </div>
  );
}
