import { Link } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { localePath } from "@/lib/locale-urls";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Check,
  Clock,
  KeyRound,
  Mail,
  MapPin,
  PenLine,
  Phone,
  Send,
  Star,
} from "lucide-react";
import ChatThread from "@/components/ChatThread";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SubmitButton from "@/components/ui/SubmitButton";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  cancelByGuest,
  changeReservationDates,
  payDeposit,
  sendGuestMessage,
} from "@/lib/actions";
import { canCheckIn } from "@/lib/checkin";
import { nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { p24Configured } from "@/lib/payments";
import { canReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

function dayLongPl(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default async function ReservationPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{
    changed?: string;
    error?: string;
    paid?: string;
    checkedin?: string;
    reviewed?: string;
  }>;
}) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const locale = await getLocale();
  const t = await getTranslations("guest");
  const tCommon = await getTranslations("common");
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      review: true,
      unit: { include: { unitType: { include: { property: true } } } },
    },
  });
  if (!reservation) notFound();

  // wejście gościa na stronę = przeczytanie odpowiedzi obiektu
  await prisma.message.updateMany({
    where: { reservationId: reservation.id, sender: "OWNER", readAt: null },
    data: { readAt: new Date() },
  });
  const messages = await prisma.message.findMany({
    where: { reservationId: reservation.id },
    orderBy: { createdAt: "asc" },
  });

  const r = reservation;
  const property = r.unit.unitType.property;
  const expired =
    r.status === "PENDING" && (!r.expiresAt || r.expiresAt <= new Date());
  const payable = r.status === "PENDING" && !expired;
  const active = r.status === "CONFIRMED" || payable;
  const changeable = active && r.checkIn > todayISO();
  const p24Enabled = payable && p24Configured(property);
  const confirmed = r.status === "CONFIRMED";

  return (
    <div className="space-y-5">
      {/* Nagłówek statusu (18a) */}
      <div className="flex items-center gap-3.5">
        <div
          className={`flex h-14 w-14 flex-none items-center justify-center rounded-2xl ${
            confirmed
              ? "bg-brand-400 shadow-[0_12px_26px_-10px_rgba(74,222,155,0.6)]"
              : expired || r.status === "CANCELLED"
                ? "bg-danger-100 text-danger-600"
                : "bg-accent-100 text-accent-500"
          }`}
        >
          {confirmed ? (
            <Check size={28} strokeWidth={2.6} className="text-brand-950" />
          ) : (
            <Clock size={26} strokeWidth={2} />
          )}
        </div>
        <div>
          <h1 className="text-[25px] font-bold leading-tight">
            {confirmed
              ? t("status.confirmed")
              : r.status === "CANCELLED"
                ? t("status.cancelled")
                : expired
                  ? t("status.expired")
                  : t("status.pending")}
          </h1>
          <p className="mt-0.5 text-[13.5px] text-slate-500">
            {confirmed
              ? t("status.confirmedSub", { property: property.name })
              : payable
                ? t("status.payableSub", { amount: formatPln(r.depositGr) })
                : `${property.name} · ${r.guestName}`}
          </p>
        </div>
      </div>

      {sp.changed && <p className="alert-success">{t("alerts.datesChanged")}</p>}
      {sp.checkedin && <p className="alert-success">{t("alerts.checkedIn")}</p>}
      {sp.reviewed && <p className="alert-success">{t("alerts.reviewThanks")}</p>}
      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.paid && payable && (
        <p className="alert-success">{t("alerts.paymentPending")}</p>
      )}
      {expired && <p className="alert-warning">{t("alerts.expired")}</p>}

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        {/* Kolumna główna */}
        <div className="min-w-0 space-y-4">
          {/* Bilet rezerwacji (18a) */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between bg-brand-900 px-5 py-4 text-white">
              <div>
                <div className="th !text-[#8fb5a2]">{t("ticket.code")}</div>
                <div className="tnum mt-0.5 text-xl font-bold">{r.code}</div>
              </div>
              {confirmed ? (
                <Badge tone="mint">{t("ticket.badgePaid")}</Badge>
              ) : payable ? (
                <Badge tone="warning">{t("ticket.badgePending")}</Badge>
              ) : (
                <Badge tone="danger">
                  {expired ? t("ticket.badgeExpired") : t("ticket.badgeCancelled")}
                </Badge>
              )}
            </div>
            <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
              <div>
                <div className="th">{t("ticket.property")}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {property.name} · {r.unit.unitType.name} ({r.unit.name})
                </div>
              </div>
              <div>
                <div className="th">{t("ticket.guests")}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {tCommon("guests", { count: r.guests })} · {r.guestName}
                </div>
              </div>
              <div>
                <div className="th">{t("ticket.checkIn")}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {dayLongPl(r.checkIn)} ·{" "}
                  {t("ticket.fromTime", { time: property.checkInFrom })}
                </div>
              </div>
              <div>
                <div className="th">{t("ticket.checkOut")}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {dayLongPl(r.checkOut)} ·{" "}
                  {t("ticket.toTime", { time: property.checkOutTo })}
                </div>
              </div>
              <div>
                <div className="th">{t("ticket.stay")}</div>
                <div className="mt-0.5 text-sm font-semibold">
                  {tCommon("nights", {
                    count: nightsBetween(r.checkIn, r.checkOut),
                  })}
                  {r.discountGr > 0 && (
                    <span className="text-brand-600">
                      {" "}
                      · {t("ticket.discount", { amount: formatPln(r.discountGr) })}
                      {r.promoCode && ` (${r.promoCode})`}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="th">{t("ticket.amount")}</div>
                <div className="tnum mt-0.5 text-sm font-semibold">
                  {formatPln(r.totalGr)}
                  {r.depositGr > 0 && (
                    <span className="font-normal text-slate-500">
                      {" "}
                      · {t("ticket.deposit", { amount: formatPln(r.depositGr) })}
                    </span>
                  )}
                </div>
              </div>
            </div>
            {payable && (
              <div className="border-t-2 border-dashed border-slate-200 px-5 py-4">
                <form action={payDeposit} className="space-y-2">
                  <input type="hidden" name="code" value={r.code} />
                  <Button type="submit" size="lg" variant="accent" className="w-full">
                    {p24Enabled
                      ? t("pay.p24", { amount: formatPln(r.depositGr) })
                      : t("pay.simulated", { amount: formatPln(r.depositGr) })}
                  </Button>
                  <p className="text-center text-xs text-slate-500">
                    {p24Enabled ? t("pay.p24Note") : t("pay.simulatedNote")}
                  </p>
                </form>
              </div>
            )}
          </div>

          {/* Następny krok: meldunek (18a) */}
          {canCheckIn(r) && (
            <div className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-brand-200 bg-brand-50 px-4 py-4">
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-white text-brand-600">
                <PenLine size={20} strokeWidth={2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-bold text-brand-900">
                  {t("checkin.title")}
                </div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {property.arrivalInfo
                    ? t("checkin.descWithArrivalInfo")
                    : t("checkin.desc")}
                </div>
              </div>
              <Button href={localePath(`/r/${r.code}/meldunek`, locale)}>
                {t("checkin.cta")}
              </Button>
            </div>
          )}

          {r.checkInStatus === "COMPLETED" && (
            <p className="alert-success">{t("alerts.checkedInOnline")}</p>
          )}

          {/* Instrukcje przyjazdu */}
          {r.checkInStatus === "COMPLETED" && confirmed && property.arrivalInfo && (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <KeyRound size={16} strokeWidth={2} className="text-brand-600" />
                    {t("arrival.title")}
                  </span>
                }
              />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {property.arrivalInfo}
                </p>
              </CardBody>
            </Card>
          )}

          {/* Opinia */}
          {canReview({ ...r, hasReview: !!r.review }) && (
            <Link
              href={`/r/${r.code}/opinia`}
              className="flex items-center gap-3.5 rounded-[14px] border border-accent-200 bg-accent-100 px-4 py-4 transition-colors hover:bg-accent-100/70"
            >
              <div className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-xl bg-white text-accent-400">
                <Star size={20} strokeWidth={2} fill="currentColor" />
              </div>
              <div>
                <p className="text-[13.5px] font-bold text-brand-900">
                  {t("review.title")}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{t("review.sub")}</p>
              </div>
            </Link>
          )}
          {r.review && !sp.reviewed && (
            <p className="alert-success">{t("alerts.reviewThanks")}</p>
          )}

          {/* Zmiana terminu (7b) */}
          {changeable && (
            <details className="card group overflow-hidden">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-5 py-4 text-sm font-semibold transition-colors hover:bg-brand-50">
                <CalendarDays size={16} strokeWidth={2} className="text-brand-600" />
                {t("change.title")}
              </summary>
              <form
                action={changeReservationDates}
                className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-3"
              >
                <input type="hidden" name="code" value={r.code} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="label">
                    {t("change.newCheckIn")}
                    <input
                      type="date"
                      name="from"
                      required
                      min={todayISO()}
                      defaultValue={r.checkIn}
                      className="input"
                    />
                  </label>
                  <label className="label">
                    {t("change.newCheckOut")}
                    <input
                      type="date"
                      name="to"
                      required
                      min={todayISO()}
                      defaultValue={r.checkOut}
                      className="input"
                    />
                  </label>
                  <label className="label">
                    {t("change.guests", { max: r.unit.unitType.maxGuests })}
                    <input
                      type="number"
                      name="guests"
                      min={1}
                      max={r.unit.unitType.maxGuests}
                      defaultValue={r.guests}
                      className="input"
                    />
                  </label>
                </div>
                <Button type="submit" className="w-full">
                  {t("change.submit")}
                </Button>
                <p className="text-xs text-slate-500">
                  {t("change.note")}
                  {confirmed && ` ${t("change.noteDeposit")}`}
                </p>
              </form>
            </details>
          )}

          {/* Czat */}
          <Card>
            <div id="czat" />
            <CardHeader
              title={t("chat.title")}
              sub={t("chat.sub", { property: property.name })}
            />
            <CardBody className="space-y-3">
              <ChatThread
                messages={messages}
                viewer="GUEST"
                labels={{
                  empty: t("chat.empty"),
                  you: t("chat.you"),
                  owner: t("chat.owner"),
                  guest: t("chat.guest"),
                }}
              />
              <form
                action={sendGuestMessage}
                className="flex items-end gap-2 rounded-[11px] border border-slate-200 p-1.5 pl-3"
              >
                <input type="hidden" name="code" value={r.code} />
                <textarea
                  name="body"
                  rows={1}
                  required
                  maxLength={2000}
                  placeholder={t("chat.placeholder")}
                  className="min-h-[32px] w-full resize-y bg-transparent py-1.5 text-[12.5px] focus:outline-none"
                />
                <SubmitButton
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-900 text-white transition-colors hover:bg-brand-950"
                  title={t("chat.send")}
                  // przycisk ma stałe 32px — spinner zastępuje ikonę
                  pendingMode="replace"
                >
                  <Send size={15} strokeWidth={2} />
                </SubmitButton>
              </form>
            </CardBody>
          </Card>

          {active && (
            <form action={cancelByGuest} className="text-center">
              <input type="hidden" name="code" value={r.code} />
              <SubmitButton
                className="inline-flex items-center gap-1.5 text-sm text-danger-600 hover:underline"
                spinnerSize={13}
              >
                {t("cancel.cta")}
              </SubmitButton>
            </form>
          )}
        </div>

        {/* Sidebar: kontakt + dojazd (18a) */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="mb-3 text-[13.5px] font-bold">{t("contact.title")}</div>
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[11px] bg-brand-900 text-sm font-bold text-brand-400">
                {property.name
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("")}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">{property.name}</div>
                <div className="text-[11px] text-slate-400">{t("contact.replyVia")}</div>
              </div>
            </div>
            <div className="space-y-2 text-[12.5px] text-slate-600">
              <div className="flex items-center gap-2">
                <Mail size={14} strokeWidth={2} className="flex-none text-slate-400" />
                {t("contact.replyTo", { email: r.email })}
              </div>
              {r.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} strokeWidth={2} className="flex-none text-slate-400" />
                  {t("contact.yourPhone", { phone: r.phone })}
                </div>
              )}
            </div>
          </Card>

          {property.address && (
            <Card className="overflow-hidden">
              <div
                className="tnum flex h-[130px] items-center justify-center text-[10px] text-slate-400"
                style={{
                  background:
                    "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 9px,#e6ede9 9px,#e6ede9 18px)",
                }}
              >
                {t("contact.mapPlaceholder")}
              </div>
              <div className="flex items-center gap-2 px-4 py-3">
                <MapPin size={15} strokeWidth={2} className="flex-none text-brand-600" />
                <span className="text-xs font-semibold">{property.address}</span>
              </div>
            </Card>
          )}

          <div className="card space-y-1.5 px-4 py-3.5 text-[12.5px] text-slate-500">
            <p className="flex items-center gap-2">
              <Clock size={13} strokeWidth={2} className="text-slate-400" />
              {t("contact.hours", {
                checkIn: property.checkInFrom,
                checkOut: property.checkOutTo,
              })}
            </p>
            <p>
              <Link
                href={`/o/${property.slug}`}
                className="font-medium text-brand-600 hover:underline"
              >
                {t("contact.propertyPage")}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
