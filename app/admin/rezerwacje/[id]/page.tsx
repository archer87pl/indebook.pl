import Link from "next/link";
import { notFound } from "next/navigation";
import ChatThread from "@/components/ChatThread";
import StatusBadge from "@/components/StatusBadge";
import {
  adminSendCheckInInvite,
  adminUpdateReservation,
  issueInvoice,
  sendOwnerMessage,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { canCheckIn, docTypeLabel, maskDocNumber } from "@/lib/checkin";
import { formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { INVOICE_KINDS, VAT_RATES } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function EditReservationPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; invited?: string }>;
}) {
  const { property } = await requireOwner();
  const { id } = await props.params;
  const sp = await props.searchParams;

  const reservation = await prisma.reservation.findUnique({
    where: { id: Number(id) },
    include: { unit: { include: { unitType: true } }, checkInCard: true },
  });
  if (!reservation || reservation.unit.unitType.propertyId !== property.id) notFound();
  const card = reservation.checkInCard;

  // otwarcie rezerwacji = przeczytanie wiadomości gościa
  await prisma.message.updateMany({
    where: { reservationId: reservation.id, sender: "GUEST", readAt: null },
    data: { readAt: new Date() },
  });
  const messages = await prisma.message.findMany({
    where: { reservationId: reservation.id },
    orderBy: { createdAt: "asc" },
  });
  const invoices = await prisma.invoice.findMany({
    where: { reservationId: reservation.id },
    orderBy: { id: "desc" },
  });

  const input = "input w-full";

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          Rezerwacja <span className="font-mono">{reservation.code}</span>
        </h1>
        <StatusBadge status={reservation.status} />
      </div>
      <p className="text-sm text-slate-500">
        {reservation.unit.unitType.name} ({reservation.unit.name}) · źródło:{" "}
        {reservation.source === "MANUAL" ? "ręczna" : "online"}
        {reservation.paymentOrderId && ` · płatność P24 #${reservation.paymentOrderId}`}
      </p>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">✓ Zapisano zmiany.</p>}
      {sp.invited && (
        <p className="alert-success">✓ Link do meldunku online wysłany do gościa.</p>
      )}

      <div className="card p-6 space-y-3 text-sm">
        <h2 className="font-semibold text-brand-950">Meldunek online</h2>
        {card ? (
          <>
            <p className="text-emerald-700 font-semibold">
              ✓ Wypełniony {formatDateShortPl(card.completedAt.toISOString().slice(0, 10))}
              {reservation.emailVerifiedAt && " · e-mail gościa potwierdzony ✓"}
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600">
              <span className="text-slate-400">Gość</span>
              <span>{card.fullName}</span>
              <span className="text-slate-400">Obywatelstwo</span>
              <span>{card.citizenship}</span>
              <span className="text-slate-400">Dokument</span>
              <span>
                {docTypeLabel(card.docType)} {maskDocNumber(card.docNumber)}
              </span>
              {card.carPlate && (
                <>
                  <span className="text-slate-400">Nr rej. auta</span>
                  <span>{card.carPlate}</span>
                </>
              )}
              {card.arrivalTime && (
                <>
                  <span className="text-slate-400">Przyjazd ok.</span>
                  <span>{card.arrivalTime}</span>
                </>
              )}
            </div>
            <Link
              href={`/admin/rezerwacje/${reservation.id}/karta`}
              className="btn-quiet inline-block"
            >
              Karta meldunkowa (podgląd / druk) →
            </Link>
          </>
        ) : canCheckIn(reservation) ? (
          <>
            <p className="text-slate-500">
              Gość nie wypełnił jeszcze karty meldunkowej.
            </p>
            {reservation.email && !reservation.email.endsWith("@rezio.local") ? (
              <form action={adminSendCheckInInvite}>
                <input type="hidden" name="id" value={reservation.id} />
                <button className="btn-quiet">✉ Wyślij link do meldunku</button>
              </form>
            ) : (
              <p className="text-xs text-amber-700">
                Uzupełnij e-mail gościa poniżej, aby wysłać link do meldunku.
              </p>
            )}
          </>
        ) : (
          <p className="text-slate-500">
            Meldunek online jest dostępny dla potwierdzonych rezerwacji przed
            wymeldowaniem.
          </p>
        )}
      </div>

      <div id="czat" className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-brand-950">💬 Czat z gościem</h2>
          <p className="text-xs text-slate-500">
            Gość dostanie powiadomienie e-mailem i odpowie na stronie swojej
            rezerwacji.
          </p>
        </div>
        <ChatThread messages={messages} viewer="OWNER" />
        {reservation.email && !reservation.email.endsWith("@rezio.local") ? (
          <form action={sendOwnerMessage} className="space-y-2">
            <input type="hidden" name="id" value={reservation.id} />
            <textarea
              name="body"
              rows={2}
              required
              maxLength={2000}
              placeholder="np. Dzień dobry, pokój będzie gotowy od 14:00."
              className="input w-full"
            />
            <button type="submit" className="btn-primary">
              Wyślij do gościa
            </button>
          </form>
        ) : (
          <p className="text-xs text-amber-700">
            Uzupełnij e-mail gościa poniżej, aby pisać wiadomości.
          </p>
        )}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold text-brand-950">Faktury</h2>
        {invoices.length > 0 && (
          <div className="space-y-1 text-sm">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2"
              >
                <span>
                  <span className="font-mono font-semibold">{inv.number}</span>{" "}
                  <span className="text-slate-400">
                    · {formatPln(inv.grossGr)} brutto · {inv.issueDate}
                  </span>
                </span>
                <Link
                  href={`/admin/faktury/${inv.id}`}
                  className="text-brand-700 font-semibold hover:underline"
                >
                  Podgląd / druk →
                </Link>
              </div>
            ))}
          </div>
        )}
        <form action={issueInvoice} className="space-y-3 border-t border-slate-100 pt-3">
          <input type="hidden" name="reservationId" value={reservation.id} />
          <div className="grid grid-cols-2 gap-4">
            <label className="label">
              Rodzaj faktury
              <select name="kind" defaultValue="KONCOWA" className={input}>
                {INVOICE_KINDS.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="label">
              Stawka VAT (%)
              <select name="vatRate" defaultValue="8" className={input}>
                {VAT_RATES.map((v) => (
                  <option key={v} value={v}>
                    {v}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="label">
            Nabywca (nazwa / imię i nazwisko) *
            <input name="buyerName" required minLength={3} defaultValue={reservation.guestName} className={input} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="label">
              NIP nabywcy
              <input name="buyerNip" defaultValue={reservation.nip} className={input} />
            </label>
            <label className="label">
              Adres nabywcy
              <input name="buyerAddress" defaultValue={card?.address ?? ""} className={input} />
            </label>
          </div>
          <label className="label">
            Nazwa pozycji (puste = domyślna)
            <input
              name="itemName"
              placeholder={`Usługa noclegowa — ${reservation.unit.unitType.name}, pobyt ${reservation.checkIn} → ${reservation.checkOut}`}
              className={input}
            />
          </label>
          <p className="text-xs text-slate-500">
            Kwota faktury: {formatPln(reservation.totalGr)} brutto (faktura
            zaliczkowa: {formatPln(reservation.depositGr)}). Dane sprzedawcy pobierane
            z ustawień obiektu.
          </p>
          <button type="submit" className="btn-primary">
            Wystaw fakturę
          </button>
        </form>
      </div>

      <form action={adminUpdateReservation} className="card p-6 space-y-4">
        <input type="hidden" name="id" value={reservation.id} />
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            Przyjazd
            <input type="date" name="from" required defaultValue={reservation.checkIn} className={input} />
          </label>
          <label className="label">
            Wyjazd
            <input type="date" name="to" required defaultValue={reservation.checkOut} className={input} />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Przy zmianie terminu system sprawdzi dostępność i w razie potrzeby przydzieli
          inną jednostkę tego samego typu. Gość dostanie e-mail o zmianie.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            Liczba gości
            <input type="number" name="guests" min={1} defaultValue={reservation.guests} className={input} />
          </label>
          <label className="label">
            Cena łączna (zł)
            <input
              name="totalZl"
              required
              defaultValue={(reservation.totalGr / 100).toString().replace(".", ",")}
              className={input}
            />
          </label>
        </div>
        <label className="label">
          Imię i nazwisko *
          <input name="guestName" required minLength={3} defaultValue={reservation.guestName} className={input} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            E-mail
            <input type="email" name="email" defaultValue={reservation.email} className={input} />
          </label>
          <label className="label">
            Telefon
            <input name="phone" defaultValue={reservation.phone} className={input} />
          </label>
        </div>
        <label className="label">
          NIP (do faktury)
          <input name="nip" defaultValue={reservation.nip} className={input} />
        </label>
        <label className="label">
          Notatki
          <textarea name="notes" rows={3} defaultValue={reservation.notes} className={input} />
        </label>
        <div className="flex items-center justify-between">
          <button type="submit" className="btn-primary">
            Zapisz zmiany
          </button>
          <Link href="/admin/rezerwacje" className="text-sm text-slate-500 hover:underline">
            ← Wróć do listy
          </Link>
        </div>
      </form>
    </div>
  );
}
