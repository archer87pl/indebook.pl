import Link from "next/link";
import { replyToReview, toggleReviewHidden } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { averageRating, REVIEW_MAX, stars } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const { property } = await requireOwner();
  const reviews = await prisma.review.findMany({
    where: { propertyId: property.id },
    include: { reservation: { select: { code: true } } },
    orderBy: { createdAt: "desc" },
  });
  const visible = reviews.filter((r) => !r.hidden);
  const avg = averageRating(visible.map((r) => r.rating));

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Opinie</h1>
        {visible.length > 0 && (
          <span className="text-sm text-slate-500">
            <span className="text-accent-500">{stars(avg)}</span>{" "}
            {avg.toFixed(1).replace(".", ",")} / 5 · {visible.length} publicznych
          </span>
        )}
      </div>

      {reviews.length === 0 && (
        <p className="card px-6 py-8 text-center text-slate-500">
          Brak opinii. Prośba o opinię wysyłana jest automatycznie dzień po
          wymeldowaniu (e-mail + SMS).
        </p>
      )}

      <div className="space-y-3">
        {reviews.map((rev) => (
          <div
            key={rev.id}
            className={`card p-5 space-y-3 ${rev.hidden ? "opacity-60" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-brand-950">
                  {rev.authorName}
                </span>{" "}
                <span className="text-accent-500">{stars(rev.rating)}</span>
                {rev.hidden && (
                  <span className="ml-2 text-xs bg-slate-200 text-slate-600 rounded px-2 py-0.5">
                    ukryta
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {formatDateShortPl(rev.createdAt.toISOString().slice(0, 10))} ·{" "}
                <Link
                  href={`/admin/rezerwacje/${rev.reservationId}`}
                  className="font-mono hover:underline"
                >
                  {rev.reservation.code}
                </Link>
              </span>
            </div>

            {rev.comment && (
              <p className="text-sm text-slate-600 whitespace-pre-line">
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
                className="input w-full text-sm"
              />
              <button className="btn-quiet py-1.5 text-sm">
                {rev.ownerReply ? "Zapisz odpowiedź" : "Odpowiedz publicznie"}
              </button>
            </form>
            <form action={toggleReviewHidden} className="-mt-1">
              <input type="hidden" name="id" value={rev.id} />
              <button className="text-sm text-slate-500 hover:text-red-600">
                {rev.hidden ? "Przywróć opinię" : "Ukryj opinię"}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
