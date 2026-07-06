import Link from "next/link";
import { notFound } from "next/navigation";
import StatusBadge from "@/components/StatusBadge";
import { adminUpdateReservation } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function EditReservationPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { property } = await requireOwner();
  const { id } = await props.params;
  const sp = await props.searchParams;

  const reservation = await prisma.reservation.findUnique({
    where: { id: Number(id) },
    include: { unit: { include: { unitType: true } } },
  });
  if (!reservation || reservation.unit.unitType.propertyId !== property.id) notFound();

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
