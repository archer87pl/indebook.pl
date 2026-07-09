import Link from "next/link";
import { notFound } from "next/navigation";
import ChatThread from "@/components/ChatThread";
import StatusBadge from "@/components/StatusBadge";
import {
  cancelByGuest,
  changeReservationDates,
  payDeposit,
  sendGuestMessage,
} from "@/lib/actions";
import { canCheckIn } from "@/lib/checkin";
import { formatDatePl, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln, plNights } from "@/lib/format";
import { p24Configured } from "@/lib/payments";
import { canReview } from "@/lib/reviews";

export const dynamic = "force-dynamic";

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

  const property = reservation.unit.unitType.property;
  const expired =
    reservation.status === "PENDING" &&
    (!reservation.expiresAt || reservation.expiresAt <= new Date());
  const payable = reservation.status === "PENDING" && !expired;
  const active = reservation.status === "CONFIRMED" || payable;
  const changeable = active && reservation.checkIn > todayISO();

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand-950">
          Rezerwacja <span className="font-mono">{reservation.code}</span>
        </h1>
        <StatusBadge status={expired ? "CANCELLED" : reservation.status} />
      </div>

      {sp.changed && (
        <p className="alert-success">
          ✓ Termin pobytu został zmieniony. Potwierdzenie wysłaliśmy e-mailem.
        </p>
      )}
      {sp.checkedin && (
        <p className="alert-success">
          ✓ Karta meldunkowa wypełniona. Dziękujemy — do zobaczenia!
        </p>
      )}
      {sp.reviewed && (
        <p className="alert-success">
          ✓ Dziękujemy za opinię o pobycie!
        </p>
      )}
      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.paid && reservation.status === "PENDING" && !expired && (
        <p className="alert-success">
          Płatność przyjęta — czekamy na potwierdzenie z bramki. Odśwież stronę za
          chwilę.
        </p>
      )}
      {expired && (
        <p className="alert-warning">
          Czas na wpłatę zaliczki minął — rezerwacja wygasła. Sprawdź dostępność ponownie.
        </p>
      )}

      <div className="card p-6 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Obiekt</span>
          <span className="font-medium">{property.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Pokój</span>
          <span className="font-medium">
            {reservation.unit.unitType.name} ({reservation.unit.name})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Pobyt</span>
          <span className="font-medium">
            {formatDatePl(reservation.checkIn)} → {formatDatePl(reservation.checkOut)} (
            {plNights(nightsBetween(reservation.checkIn, reservation.checkOut))})
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Goście</span>
          <span className="font-medium">
            {reservation.guests} os. · {reservation.guestName}
          </span>
        </div>
        <hr className="border-slate-200" />
        {reservation.discountGr > 0 && (
          <div className="flex justify-between text-emerald-700">
            <span>
              Rabat{reservation.promoCode && ` (${reservation.promoCode})`}
            </span>
            <span>−{formatPln(reservation.discountGr)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-brand-950">
          <span>Kwota pobytu</span>
          <span>{formatPln(reservation.totalGr)}</span>
        </div>
        {reservation.depositGr > 0 && (
          <div className="flex justify-between text-brand-700 font-semibold">
            <span>Zaliczka</span>
            <span>{formatPln(reservation.depositGr)}</span>
          </div>
        )}
      </div>

      {canCheckIn(reservation) && (
        <Link
          href={`/r/${reservation.code}/meldunek`}
          className="block card px-6 py-4 border-brand-300 bg-brand-50 hover:bg-brand-100 transition-colors"
        >
          <p className="font-semibold text-brand-950">
            📝 Wypełnij meldunek online
          </p>
          <p className="text-sm text-slate-600">
            Zajmie 2 minuty i przyspieszy zameldowanie. Po wypełnieniu pokażemy
            instrukcje przyjazdu{property.arrivalInfo ? " (kody, WiFi, dojazd)" : ""}.
          </p>
        </Link>
      )}

      {reservation.checkInStatus === "COMPLETED" && (
        <p className="alert-success">✓ Zameldowany online — karta meldunkowa wypełniona.</p>
      )}

      {reservation.checkInStatus === "COMPLETED" &&
        reservation.status === "CONFIRMED" &&
        property.arrivalInfo && (
          <div className="card p-6 space-y-2">
            <h2 className="font-semibold text-brand-950">
              🔑 Informacje na przyjazd
            </h2>
            <p className="text-sm text-slate-700 whitespace-pre-line">
              {property.arrivalInfo}
            </p>
          </div>
        )}

      {canReview({ ...reservation, hasReview: !!reservation.review }) && (
        <Link
          href={`/r/${reservation.code}/opinia`}
          className="block card px-6 py-4 border-accent-400/50 bg-accent-100 hover:bg-accent-100/70 transition-colors"
        >
          <p className="font-semibold text-brand-950">⭐ Jak minął pobyt?</p>
          <p className="text-sm text-slate-600">
            Wystaw krótką opinię — zajmie chwilę i pomoże innym gościom.
          </p>
        </Link>
      )}

      {reservation.review && !sp.reviewed && (
        <p className="alert-success">✓ Dziękujemy za opinię o pobycie!</p>
      )}

      {payable && (
        <form action={payDeposit} className="space-y-2">
          <input type="hidden" name="code" value={reservation.code} />
          <button type="submit" className="btn-accent w-full py-3">
            {p24Configured()
              ? `Zapłać zaliczkę ${formatPln(reservation.depositGr)} — Przelewy24`
              : `Opłać zaliczkę ${formatPln(reservation.depositGr)} (symulacja płatności)`}
          </button>
          <p className="text-xs text-slate-500 text-center">
            {p24Configured()
              ? "Bezpieczna płatność Przelewy24: BLIK, karta, szybki przelew."
              : "Tryb deweloperski: bramka płatności symulowana. Skonfiguruj P24_* w .env, aby włączyć Przelewy24."}
          </p>
        </form>
      )}

      {changeable && (
        <details className="card overflow-hidden group">
          <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-brand-950 hover:bg-brand-50 transition-colors">
            📅 Zmień termin pobytu
          </summary>
          <form
            action={changeReservationDates}
            className="px-6 pb-6 pt-2 space-y-4 border-t border-slate-100"
          >
            <input type="hidden" name="code" value={reservation.code} />
            <div className="grid grid-cols-3 gap-4">
              <label className="label">
                Nowy przyjazd
                <input
                  type="date"
                  name="from"
                  required
                  min={todayISO()}
                  defaultValue={reservation.checkIn}
                  className="input"
                />
              </label>
              <label className="label">
                Nowy wyjazd
                <input
                  type="date"
                  name="to"
                  required
                  min={todayISO()}
                  defaultValue={reservation.checkOut}
                  className="input"
                />
              </label>
              <label className="label">
                Goście (maks. {reservation.unit.unitType.maxGuests})
                <input
                  type="number"
                  name="guests"
                  min={1}
                  max={reservation.unit.unitType.maxGuests}
                  defaultValue={reservation.guests}
                  className="input"
                />
              </label>
            </div>
            <button type="submit" className="btn-primary w-full">
              Zmień termin
            </button>
            <p className="text-xs text-slate-500">
              Cena pobytu zostanie przeliczona według cennika dla nowego terminu.
              {reservation.status === "CONFIRMED" &&
                " Wpłacona zaliczka zostaje zaliczona na poczet pobytu."}
            </p>
          </form>
        </details>
      )}

      <div id="czat" className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-brand-950">
            💬 Wiadomości do obiektu
          </h2>
          <p className="text-xs text-slate-500">
            {property.name} dostanie powiadomienie e-mailem, a odpowiedź zobaczysz
            tutaj.
          </p>
        </div>
        <ChatThread messages={messages} viewer="GUEST" />
        <form action={sendGuestMessage} className="space-y-2">
          <input type="hidden" name="code" value={reservation.code} />
          <textarea
            name="body"
            rows={2}
            required
            maxLength={2000}
            placeholder="np. Będziemy około 18:00, czy możemy zostawić bagaże wcześniej?"
            className="input w-full"
          />
          <button type="submit" className="btn-primary">
            Wyślij wiadomość
          </button>
        </form>
      </div>

      {active && (
        <form action={cancelByGuest} className="text-center">
          <input type="hidden" name="code" value={reservation.code} />
          <button type="submit" className="text-sm text-red-600 hover:underline">
            Anuluj rezerwację
          </button>
        </form>
      )}

      <p className="text-sm text-slate-500 text-center">
        Zameldowanie od {property.checkInFrom}, wymeldowanie do {property.checkOutTo}.{" "}
        {property.address}
      </p>
    </div>
  );
}
