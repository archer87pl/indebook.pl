import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, LogIn, Mail } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  superDeleteProperty,
  superImpersonate,
  superSendPasswordReset,
  superToggleSuspend,
  superUpdateOwner,
  superUpdateProperty,
} from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";
import { formatRangeShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { PLANS } from "@/lib/plans";
import { averageRating } from "@/lib/reviews";

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
  const [reservationsTotal, gmv, reviews, recentReservations, brokenFeeds] =
    await prisma.$transaction([
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
      prisma.reservation.findMany({
        where: { unit: { unitType: { propertyId } } },
        include: { unit: { include: { unitType: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.icalFeed.findMany({
        where: { unit: { unitType: { propertyId } }, lastError: { not: "" } },
        include: { unit: true },
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
      <Link
        href="/superadmin"
        className="text-sm font-semibold text-brand-600 hover:underline"
      >
        ← Wróć do panelu platformy
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{property.name}</h1>
          <Link
            href={`/o/${property.slug}`}
            className="tnum text-sm text-brand-600 hover:underline"
          >
            /o/{property.slug}
          </Link>
        </div>
        {property.suspended && <Badge tone="danger">zawieszony</Badge>}
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">Zapisano zmiany.</p>}
      {sp.reset && (
        <p className="alert-success">Wysłano właścicielowi link do resetu hasła.</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <p className="nums text-xl font-bold">{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Feedy iCal z błędami */}
      {brokenFeeds.length > 0 && (
        <div className="space-y-2 rounded-[14px] border border-danger-600/30 bg-danger-100 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-danger-600">
            <AlertTriangle size={15} strokeWidth={2} />
            Feedy iCal z błędami synchronizacji
          </p>
          {brokenFeeds.map((f) => (
            <p key={f.id} className="text-xs text-danger-600">
              <span className="font-semibold">
                {f.unit.name} · {f.name || f.channel}:
              </span>{" "}
              {f.lastError}
            </p>
          ))}
        </div>
      )}

      {/* Ostatnie rezerwacje */}
      <Card>
        <CardHeader
          title="Ostatnie rezerwacje"
          sub={`${reservationsTotal} łącznie`}
          action={
            <Button
              size="sm"
              variant="quiet"
              href={`/superadmin/rezerwacje?pid=${property.id}`}
            >
              Wszystkie →
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <tbody>
              {recentReservations.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 first:border-0 transition-colors hover:bg-slate-50"
                >
                  <td className="tnum px-[18px] py-2.5 text-[11px] font-semibold text-brand-600">
                    {r.code}
                  </td>
                  <td className="px-2 py-2.5 font-semibold">{r.guestName}</td>
                  <td className="px-2 py-2.5 text-slate-600">
                    {r.unit.unitType.name} ({r.unit.name})
                  </td>
                  <td className="tnum px-2 py-2.5 text-slate-600">
                    {formatRangeShortPl(r.checkIn, r.checkOut)}
                  </td>
                  <td className="tnum px-2 py-2.5 text-right font-semibold">
                    {formatPln(r.totalGr)}
                  </td>
                  <td className="px-[18px] py-2.5 text-right">
                    {r.status === "CONFIRMED" ? (
                      <Badge tone="success">Potwierdzona</Badge>
                    ) : r.status === "PENDING" ? (
                      <Badge tone="warning">Oczekuje</Badge>
                    ) : (
                      <Badge tone="danger">Anulowana</Badge>
                    )}
                  </td>
                </tr>
              ))}
              {recentReservations.length === 0 && (
                <tr>
                  <td className="px-[18px] py-6 text-center text-slate-400">
                    Brak rezerwacji
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dane obiektu */}
      <Card>
        <CardHeader title="Dane obiektu" />
        <form action={superUpdateProperty}>
          <CardBody className="space-y-4">
            <input type="hidden" name="id" value={property.id} />
            <div className="grid grid-cols-2 gap-4">
              <label className="label">
                Nazwa obiektu *
                <input name="name" required minLength={3} defaultValue={property.name} className={input} />
              </label>
              <label className="label">
                Adres strony (slug) *
                <input name="slug" required defaultValue={property.slug} className={`${input} tnum`} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
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
            <Button type="submit">Zapisz dane obiektu</Button>
          </CardBody>
        </form>
      </Card>

      {/* Konto właściciela */}
      <Card>
        <CardHeader title="Konto właściciela" />
        <form action={superUpdateOwner}>
          <CardBody className="space-y-4">
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
            <Button type="submit">Zapisz konto</Button>
          </CardBody>
        </form>
        <CardBody className="border-t border-slate-100">
          <form action={superImpersonate} className="space-y-2">
            <input type="hidden" name="userId" value={property.owner.id} />
            <p className="text-sm text-slate-500">
              Wejdź do panelu recepcji tego obiektu jako właściciel (wsparcie
              techniczne). Twoja sesja administratora zostanie zastąpiona —
              powrót wymaga ponownego zalogowania.
            </p>
            <Button variant="quiet" type="submit">
              <LogIn size={14} strokeWidth={2} /> Zaloguj jako właściciel
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <form action={superSendPasswordReset}>
          <CardBody className="space-y-2">
            <h2 className="text-[15px] font-bold">Reset hasła właściciela</h2>
            <input type="hidden" name="propertyId" value={property.id} />
            <input type="hidden" name="userId" value={property.owner.id} />
            <p className="text-sm text-slate-500">
              Wyśle na {property.owner.email} link do ustawienia nowego hasła (ważny 1 h).
            </p>
            <Button variant="quiet" type="submit">
              <Mail size={14} strokeWidth={2} /> Wyślij link do resetu hasła
            </Button>
          </CardBody>
        </form>
      </Card>

      {/* Strefa administracyjna */}
      <div className="card space-y-5 border-danger-600/30 p-6">
        <h2 className="text-[15px] font-bold text-danger-600">Strefa administracyjna</h2>

        <form action={superToggleSuspend} className="space-y-2">
          <input type="hidden" name="id" value={property.id} />
          <p className="text-sm text-slate-600">
            {property.suspended
              ? "Obiekt jest zawieszony — niewidoczny w katalogu i bez możliwości rezerwacji."
              : "Zawieszenie ukrywa obiekt w katalogu i blokuje nowe rezerwacje (dane pozostają)."}
          </p>
          <Button variant={property.suspended ? "primary" : "quiet"} type="submit">
            {property.suspended ? "Przywróć obiekt" : "Zawieś obiekt"}
          </Button>
        </form>

        <form action={superDeleteProperty} className="space-y-2 border-t border-slate-100 pt-4">
          <input type="hidden" name="id" value={property.id} />
          <p className="text-sm font-medium text-danger-600">
            Trwałe usunięcie obiektu, wszystkich rezerwacji, opinii i konta właściciela.
            Tej operacji nie można cofnąć.
          </p>
          <label className="label text-sm">
            Wpisz <span className="tnum font-bold">{property.slug}</span>, aby potwierdzić
            <input name="confirmSlug" placeholder={property.slug} className={`${input} tnum`} />
          </label>
          <button className="rounded-[11px] bg-danger-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-danger-600">
            Usuń obiekt trwale
          </button>
        </form>
      </div>
    </div>
  );
}
