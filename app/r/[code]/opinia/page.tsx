import Link from "next/link";
import { notFound } from "next/navigation";
import StarRating from "@/components/StarRating";
import { submitReview } from "@/lib/actions";
import { formatDatePl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { canReview, REVIEW_MAX, stars } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export default async function ReviewPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      review: true,
      unit: { include: { unitType: { include: { property: true } } } },
    },
  });
  if (!reservation) notFound();

  const property = reservation.unit.unitType.property;
  const backLink = (
    <Link href={`/r/${code}`} className="text-sm text-brand-700 hover:underline">
      ← Wróć do rezerwacji
    </Link>
  );

  if (reservation.review) {
    return (
      <div className="max-w-xl mx-auto space-y-5 text-center">
        <h1 className="text-2xl font-bold text-brand-950">Opinia o pobycie</h1>
        <p className="alert-success">
          ✓ Dziękujemy za opinię! Twoja ocena:{" "}
          <span className="text-accent-500">{stars(reservation.review.rating)}</span>
        </p>
        {backLink}
      </div>
    );
  }
  if (!canReview({ ...reservation, hasReview: false })) {
    return (
      <div className="max-w-xl mx-auto space-y-5 text-center">
        <h1 className="text-2xl font-bold text-brand-950">Opinia o pobycie</h1>
        <p className="alert-warning">
          Opinię będzie można wystawić po zakończonym pobycie (po{" "}
          {formatDatePl(reservation.checkOut)}).
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-950">Jak minął pobyt?</h1>
        <p className="text-sm text-slate-500">
          {property.name} · {formatDatePl(reservation.checkIn)} →{" "}
          {formatDatePl(reservation.checkOut)}
        </p>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}

      <form action={submitReview} className="card p-6 space-y-4">
        <input type="hidden" name="code" value={code} />
        <label className="label">
          Twoja ocena *
          <StarRating />
        </label>
        <label className="label">
          Opinia (opcjonalnie)
          <textarea
            name="comment"
            rows={4}
            maxLength={REVIEW_MAX}
            placeholder="Co Ci się podobało? Co moglibyśmy poprawić?"
            className="input w-full"
          />
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" name="consent" required className="mt-1" />
          <span>
            Zgadzam się na publikację opinii na stronie obiektu pod moim imieniem
            i inicjałem nazwiska (np. „{reservation.guestName.split(" ")[0]} K."). *
          </span>
        </label>
        <button type="submit" className="btn-accent w-full py-3">
          Wyślij opinię
        </button>
      </form>
    </div>
  );
}
