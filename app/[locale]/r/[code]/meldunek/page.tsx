import { Link } from "@/i18n/navigation";
import GuestError from "@/components/GuestError";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { submitCheckIn } from "@/lib/actions";
import { canCheckIn, DOC_TYPES } from "@/lib/checkin";
import { formatDate, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Meldunek online: strona publiczna po kodzie rezerwacji. Po wypełnieniu NIE
// pokazujemy tu żadnych danych z karty — pełny wgląd ma tylko właściciel.
export default async function CheckInPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string; n?: string }>;
}) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      unit: { include: { unitType: { include: { property: true } } } },
    },
  });
  if (!reservation) notFound();

  const locale = await getLocale();
  const t = await getTranslations("checkin");
  const property = reservation.unit.unitType.property;
  const backLink = (
    <Link href={`/r/${code}`} className="text-sm font-semibold text-brand-600 hover:underline">
      ← {t("back")}
    </Link>
  );

  if (reservation.checkInStatus === "COMPLETED") {
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="alert-success">{t("completed", { code })}</p>
        {backLink}
      </div>
    );
  }
  if (!canCheckIn(reservation)) {
    const past =
      reservation.status === "CONFIRMED" && reservation.checkOut < todayISO();
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="alert-warning">
          {past
            ? t("unavailable.past")
            : reservation.status === "CANCELLED"
              ? t("unavailable.cancelled")
              : t("unavailable.notConfirmed")}
        </p>
        {backLink}
      </div>
    );
  }

  const extraGuests = Math.max(0, reservation.guests - 1);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Nagłówek karty meldunkowej (8a) */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <PenLine size={22} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">{t("title")}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="tnum rounded-md bg-brand-100 px-2 py-0.5 text-[11.5px] text-brand-600">
              {code}
            </span>
            {property.name} · {formatDate(reservation.checkIn, locale)} →{" "}
            {formatDate(reservation.checkOut, locale)}
          </p>
        </div>
      </div>

      <GuestError code={sp.error} n={sp.n} />

      <p className="text-sm text-slate-600">{t("intro")}</p>

      <form action={submitCheckIn} className="space-y-4">
        <input type="hidden" name="code" value={code} />

        <Card>
          <CardHeader title={t("mainGuest")} />
          <CardBody className="space-y-4">
            <label className="label">
              {t("fullName")}
              <input
                name="fullName"
                required
                minLength={3}
                defaultValue={reservation.guestName}
                className="input w-full"
              />
            </label>
            <label className="label">
              {t("address")}
              <input
                name="address"
                required
                minLength={5}
                placeholder={t("addressPlaceholder")}
                className="input w-full"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="label">
                {t("citizenship")}
                <input
                  name="citizenship"
                  required
                  defaultValue={t("citizenshipDefault")}
                  className="input w-full"
                />
              </label>
              <label className="label">
                {t("arrivalTime")}
                <input type="time" name="arrivalTime" className="input w-full" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="label">
                {t("docType")}
                <select name="docType" className="input w-full" defaultValue="">
                  <option value="">{t("docTypeNone")}</option>
                  {DOC_TYPES.map((d) => (
                    <option key={d.key} value={d.key}>
                      {t(`docTypes.${d.key}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                {t("docNumber")}
                <input name="docNumber" className="input w-full" />
              </label>
            </div>
            <p className="text-xs text-slate-500">{t("docNote")}</p>
            <label className="label">
              {t("carPlate")}
              <input
                name="carPlate"
                placeholder={t("carPlatePlaceholder")}
                className="input tnum w-full"
              />
            </label>
          </CardBody>
        </Card>

        {extraGuests > 0 && (
          <Card>
            <CardHeader
              title={t("otherGuests", { count: extraGuests })}
              sub={t("otherGuestsSub")}
            />
            <CardBody className="space-y-4">
              {Array.from({ length: extraGuests }, (_, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <label className="label">
                    {t("guestName", { number: i + 2 })}
                    <input name={`guestName_${i + 1}`} className="input w-full" />
                  </label>
                  <label className="label">
                    {t("guestBirth")}
                    <input type="date" name={`guestBirth_${i + 1}`} className="input w-full" />
                  </label>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title={t("signature")} sub={t("signatureSub")} />
          <CardBody className="space-y-4">
            <SignaturePad />
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="terms" required className="mt-1 accent-brand-600" />
              <span>
                {t.rich("terms", {
                  property: property.name,
                  link: (chunks) => (
                    <Link
                      href={`/o/${property.slug}/regulamin`}
                      target="_blank"
                      className="font-semibold text-brand-600 underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="rodo" required className="mt-1 accent-brand-600" />
              <span>{t("rodo", { property: property.name })}</span>
            </label>
            <Button type="submit" size="lg" className="w-full">
              {t("submit")}
            </Button>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
