import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import StarRating from "@/components/StarRating";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { submitReview } from "@/lib/actions";
import { formatDatePl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { canReview, REVIEW_MAX } from "@/lib/reviews";

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

  const t = await getTranslations("review");
  const property = reservation.unit.unitType.property;
  const backLink = (
    <Link href={`/r/${code}`} className="text-sm font-semibold text-brand-600 hover:underline">
      ← {t("back")}
    </Link>
  );

  if (reservation.review) {
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="alert-success">
          {t("thanks")}{" "}
          <span className="inline-flex translate-y-0.5 gap-px text-accent-400">
            {Array.from({ length: reservation.review.rating }, (_, i) => (
              <Star key={i} size={14} strokeWidth={2} fill="currentColor" />
            ))}
          </span>
        </p>
        {backLink}
      </div>
    );
  }
  if (!canReview({ ...reservation, hasReview: false })) {
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="alert-warning">
          {t("notYet", { date: formatDatePl(reservation.checkOut) })}
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-accent-100 text-accent-400">
          <Star size={22} strokeWidth={2} fill="currentColor" />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">{t("heading")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {property.name} · {formatDatePl(reservation.checkIn)} →{" "}
            {formatDatePl(reservation.checkOut)}
          </p>
        </div>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}

      <Card>
        <form action={submitReview}>
          <CardBody className="space-y-4">
            <input type="hidden" name="code" value={code} />
            <label className="label">
              {t("rating")}
              <StarRating />
            </label>
            <label className="label">
              {t("comment")}
              <textarea
                name="comment"
                rows={4}
                maxLength={REVIEW_MAX}
                placeholder={t("commentPlaceholder")}
                className="input w-full"
              />
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="consent" required className="mt-1 accent-brand-600" />
              <span>
                {t("consent", { example: reservation.guestName.split(" ")[0] })}
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full">
              {t("submit")}
            </Button>
          </CardBody>
        </form>
      </Card>
    </div>
  );
}
