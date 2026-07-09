import Link from "next/link";
import { notFound } from "next/navigation";
import {
  superDeleteProperty,
  superSendPasswordReset,
  superToggleSuspend,
  superUpdateOwner,
  superUpdateProperty,
} from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { averageRating, stars } from "@/lib/reviews";

export const dynamic = "force-dynamic";

export default async function SuperadminPropertyPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string; reset?: string }>;
}) {
  await requireSuperadmin();
  const { id } = await props.params;
  const sp = await props.searchParams;
  const propertyId = Number(id);

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      owner: true,
      unitTypes: { include: { units: true } },
      _count: { select: { unitTypes: true, reviews: true } },
    },
  });
  if (!property) notFound();

  const units = property.unitTypes.flatMap((ut) => ut.units);
  const [reservationsTotal, gmv, reviews] = await Promise.all([
    prisma.reservation.count({
      where: { unit: { unitType: { propertyId } } },
    }),
    prisma.reservation.aggregate({
      where: { status: "CONFIRMED", unit: { unitType: { propertyId } } },
      _sum: { totalGr: true },
    }),
    prisma.review.findMany({
      where: { propertyId, hidden: false },
      select: { rating: true },
    }),
  ]);
  const avg = averageRating(reviews.map((r) => r.rating));

  const input = "input w-full";
  const stats = [
    { label: "Typy pokoi", value: String(property._count.unitTypes) },
    { label: "Jednostki", value: String(units.length) },
    { label: "Rezerwacje", value: String(reservationsTotal) },
    { label: "GMV potwierdzone", value: formatPln(gmv._sum.totalGr ?? 0) },
    {
      label: "Opinie",
      value: reviews.length ? `${avg.toFixed(1).replace(".", ",")} (${reviews.length})` : "—",
    },
  ];

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/superadmin" className="text-sm text-brand-700 hover:underline">
        ← Wróć do panelu platformy
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <Link
            href={`/o/${property.slug}`}
            className="text-sm font-mono text-brand-700 hover:underline"
          >
            /o/{property.slug}
          </Link>
        </div>
        {property.suspended && (
          <span className="rounded-full bg-red-100 text-red-700 px-3 py-1 text-xs font-bold">
            ZAWIESZONY
          </span>
        )}
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">✓ Zapisano zmiany.</p>}
      {sp.reset && (
        <p className="alert-success">✓ Wysłano właścicielowi link do resetu hasła.</p>
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Dane obiektu */}
      <form action={superUpdateProperty} className="card p-6 space-y-4">
        <h2 className="font-semibold text-brand-950">Dane obiektu</h2>
        <input type="hidden" name="id" value={property.id} />
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            Nazwa obiektu *
            <input name="name" required minLength={3} defaultValue={property.name} className={input} />
          </label>
          <label className="label">
            Adres strony (slug) *
            <input name="slug" required defaultValue={property.slug} className={`${input} font-mono`} />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="label">
            Plan
            <select name="plan" defaultValue={property.plan} className={input}>
              {PLANS.map((pl) => (
                <option key={pl.key} value={pl.key}>
                  {pl.label} ({pl.priceZl} zł)
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Zaliczka (%)
            <input
              type="number"
              name="depositPercent"
              min={0}
              max={100}
              defaultValue={property.depositPercent}
              className={input}
            />
          </label>
          <div />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            Zameldowanie od
            <input name="checkInFrom" defaultValue={property.checkInFrom} placeholder="15:00" className={input} />
          </label>
          <label className="label">
            Wymeldowanie do
            <input name="checkOutTo" defaultValue={property.checkOutTo} placeholder="11:00" className={input} />
          </label>
        </div>
        <label className="label">
          Adres
          <input name="address" defaultValue={property.address} className={input} />
        </label>
        <label className="label">
          Opis
          <textarea name="description" rows={3} defaultValue={property.description} className={input} />
        </label>
        <p className="text-xs text-slate-500">
          Zmiana planu przez administratora pomija limity jednostek (w odróżnieniu
          od samodzielnej zmiany przez właściciela).
        </p>
        <button type="submit" className="btn-primary">
          Zapisz dane obiektu
        </button>
      </form>

      {/* Konto właściciela */}
      <form action={superUpdateOwner} className="card p-6 space-y-4">
        <h2 className="font-semibold text-brand-950">Konto właściciela</h2>
        <input type="hidden" name="propertyId" value={property.id} />
        <input type="hidden" name="userId" value={property.owner.id} />
        <div className="grid grid-cols-2 gap-4">
          <label className="label">
            Imię i nazwisko *
            <input name="name" required minLength={3} defaultValue={property.owner.name} className={input} />
          </label>
          <label className="label">
            E-mail *
            <input type="email" name="email" required defaultValue={property.owner.email} className={input} />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Konto założone {property.owner.createdAt.toLocaleDateString("pl-PL")}.
        </p>
        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary">
            Zapisz konto
          </button>
        </div>
      </form>

      <form action={superSendPasswordReset} className="card p-6 space-y-2">
        <h2 className="font-semibold text-brand-950">Reset hasła właściciela</h2>
        <input type="hidden" name="propertyId" value={property.id} />
        <input type="hidden" name="userId" value={property.owner.id} />
        <p className="text-sm text-slate-500">
          Wyśle na {property.owner.email} link do ustawienia nowego hasła (ważny 1 h).
        </p>
        <button type="submit" className="btn-quiet">
          ✉ Wyślij link do resetu hasła
        </button>
      </form>

      {/* Strefa niebezpieczna */}
      <div className="card p-6 space-y-5 border-red-200">
        <h2 className="font-semibold text-red-700">Strefa administracyjna</h2>

        <form action={superToggleSuspend} className="space-y-2">
          <input type="hidden" name="id" value={property.id} />
          <p className="text-sm text-slate-600">
            {property.suspended
              ? "Obiekt jest zawieszony — niewidoczny w katalogu i bez możliwości rezerwacji."
              : "Zawieszenie ukrywa obiekt w katalogu i blokuje nowe rezerwacje (dane pozostają)."}
          </p>
          <button
            className={property.suspended ? "btn-primary" : "btn-quiet"}
          >
            {property.suspended ? "Przywróć obiekt" : "Zawieś obiekt"}
          </button>
        </form>

        <form action={superDeleteProperty} className="space-y-2 border-t border-slate-100 pt-4">
          <input type="hidden" name="id" value={property.id} />
          <p className="text-sm text-red-700 font-medium">
            Trwałe usunięcie obiektu, wszystkich rezerwacji, opinii i konta
            właściciela. Tej operacji nie można cofnąć.
          </p>
          <label className="label text-sm">
            Wpisz <span className="font-mono font-bold">{property.slug}</span>, aby potwierdzić
            <input name="confirmSlug" placeholder={property.slug} className={`${input} font-mono`} />
          </label>
          <button className="bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg px-4 py-2 text-sm">
            Usuń obiekt trwale
          </button>
        </form>
      </div>
    </div>
  );
}
