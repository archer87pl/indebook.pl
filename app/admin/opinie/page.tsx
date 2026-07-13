import Link from "next/link";
import { Eye, EyeOff, MessageSquare, Reply, Star } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { replyToReview, toggleReviewHidden } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { averageRating, REVIEW_MAX } from "@/lib/reviews";

export const dynamic = "force-dynamic";

/** Gwiazdki oceny 1–5 (odczyt) — ikony lucide zamiast znaków ★. */
function Stars({ rating, size = 13 }: { rating: number; size?: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`Ocena ${rating} z 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={2}
          className={
            n <= rating
              ? "fill-accent-400 text-accent-400"
              : "text-slate-300"
          }
        />
      ))}
    </span>
  );
}

/** Kolor paska rozkładu ocen wg 1c. */
const DIST_FILL: Record<number, string> = {
  5: "bg-brand-600",
  4: "bg-brand-300",
  3: "bg-accent-400",
  2: "bg-danger-600",
  1: "bg-danger-600",
};

export default async function ReviewsPage() {
  const { property } = await requireOwner();
  const reviews = await prisma.review.findMany({
    where: { propertyId: property.id },
    include: { reservation: { select: { code: true } } },
    orderBy: { createdAt: "desc" },
  });
  const visible = reviews.filter((r) => !r.hidden);
  const avg = averageRating(visible.map((r) => r.rating));
  const replied = visible.filter((r) => r.ownerReply).length;
  const replyRate = visible.length > 0 ? (replied / visible.length) * 100 : 0;

  if (reviews.length === 0) {
    return (
      <Card className="max-w-3xl">
        <EmptyState
          icon={<MessageSquare size={26} strokeWidth={2} />}
          title="Brak opinii"
          description="Prośba o opinię wysyłana jest automatycznie dzień po wymeldowaniu (e-mail + SMS)."
        />
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[300px_1fr]">
      {/* Podsumowanie ocen (10d) */}
      <Card>
        <CardBody className="pt-5">
          <div className="border-b border-slate-100 pb-4 text-center">
            <div className="nums text-[44px] font-bold leading-none tracking-[-0.03em]">
              {avg.toFixed(1).replace(".", ",")}
            </div>
            <div className="mt-2 flex justify-center">
              <Stars rating={Math.round(avg)} size={16} />
            </div>
            <div className="mt-2 text-xs text-slate-400">
              na podstawie {visible.length}{" "}
              {visible.length === 1 ? "opinii publicznej" : "opinii publicznych"}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {[5, 4, 3, 2, 1].map((n) => {
              const count = visible.filter((r) => r.rating === n).length;
              const pct = visible.length > 0 ? (count / visible.length) * 100 : 0;
              return (
                <div
                  key={n}
                  className="flex items-center gap-2.5 text-[11.5px]"
                >
                  <span className="flex w-9 flex-none items-center gap-1 text-slate-500">
                    {n}{" "}
                    <Star
                      size={10}
                      strokeWidth={2}
                      className="fill-accent-400 text-accent-400"
                    />
                  </span>
                  <div className="h-[7px] flex-1 overflow-hidden rounded-[4px] bg-[#e9efec]">
                    <div
                      className={`h-full rounded-[4px] ${DIST_FILL[n]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="nums w-7 flex-none text-right text-slate-400">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3.5 text-xs">
            <span className="text-slate-500">Wskaźnik odpowiedzi</span>
            <span className="nums font-bold text-brand-600">
              {replyRate.toFixed(0)}%
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Lista opinii */}
      <div className="space-y-3">
        {reviews.map((rev) => (
          <Card key={rev.id} className={rev.hidden ? "opacity-60" : ""}>
            <CardBody className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar name={rev.authorName} tone="soft" size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-slate-900">
                    {rev.authorName}
                    {rev.hidden && <Badge tone="neutral">ukryta</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDateShortPl(rev.createdAt.toISOString().slice(0, 10))}{" "}
                    ·{" "}
                    <Link
                      href={`/admin/rezerwacje/${rev.reservationId}`}
                      className="tnum font-semibold text-brand-600 hover:underline"
                    >
                      {rev.reservation.code}
                    </Link>
                  </div>
                </div>
                <Stars rating={rev.rating} />
              </div>

              {rev.comment && (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-slate-600">
                  {rev.comment}
                </p>
              )}

              <form action={replyToReview} className="space-y-2">
                <input type="hidden" name="id" value={rev.id} />
                <textarea
                  name="reply"
                  rows={2}
                  maxLength={REVIEW_MAX}
                  defaultValue={rev.ownerReply}
                  placeholder="Publiczna odpowiedź obiektu (opcjonalnie)…"
                  className="input w-full text-[13px]"
                />
                <Button size="sm" variant="quiet">
                  <Reply size={13} strokeWidth={2} />
                  {rev.ownerReply ? "Zapisz odpowiedź" : "Odpowiedz publicznie"}
                </Button>
              </form>
              <form action={toggleReviewHidden} className="-mt-1">
                <input type="hidden" name="id" value={rev.id} />
                <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-danger-600">
                  {rev.hidden ? (
                    <>
                      <Eye size={13} strokeWidth={2} /> Przywróć opinię
                    </>
                  ) : (
                    <>
                      <EyeOff size={13} strokeWidth={2} /> Ukryj opinię
                    </>
                  )}
                </button>
              </form>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
