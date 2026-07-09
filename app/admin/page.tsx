import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { requireOwner } from "@/lib/auth";
import { formatDateShortPl, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { findChannelConflicts } from "@/lib/ical";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const { property } = await requireOwner();
  const today = todayISO();
  const inProperty = { unit: { unitType: { propertyId: property.id } } };

  const [
    unitTypesCount,
    arrivals,
    departures,
    inHouse,
    pending,
    upcoming,
    conflicts,
    unreadMessages,
  ] = await Promise.all([
      prisma.unitType.count({ where: { propertyId: property.id } }),
      prisma.reservation.count({
        where: { ...inProperty, status: "CONFIRMED", checkIn: today },
      }),
      prisma.reservation.count({
        where: { ...inProperty, status: "CONFIRMED", checkOut: today },
      }),
      prisma.reservation.count({
        where: {
          ...inProperty,
          status: "CONFIRMED",
          checkIn: { lte: today },
          checkOut: { gt: today },
        },
      }),
      prisma.reservation.count({
        where: { ...inProperty, status: "PENDING", expiresAt: { gt: new Date() } },
      }),
      prisma.reservation.findMany({
        where: { ...inProperty, status: { not: "CANCELLED" }, checkOut: { gte: today } },
        include: { unit: { include: { unitType: true } } },
        orderBy: { checkIn: "asc" },
        take: 8,
      }),
      findChannelConflicts(property.id),
      prisma.message.count({
        where: { sender: "GUEST", readAt: null, reservation: inProperty },
      }),
    ]);

  if (unitTypesCount === 0) {
    return (
      <div className="card p-10 text-center space-y-4">
        <p className="text-4xl">🚀</p>
        <h1 className="text-2xl font-bold text-brand-950">
          Witaj w Rezio! Zacznij od dodania pokoi.
        </h1>
        <p className="text-slate-600 max-w-md mx-auto">
          Dodaj typy pokoi (np. „Pokój Standard&rdquo;, „Apartament&rdquo;), liczbę
          jednostek i ceny — Twoja strona rezerwacji ruszy od razu.
        </p>
        <Link href="/admin/pokoje" className="btn-primary">
          + Dodaj pierwszy typ pokoju
        </Link>
      </div>
    );
  }

  const stats = [
    { label: "Przyjazdy dziś", value: arrivals },
    { label: "Wyjazdy dziś", value: departures },
    { label: "Gości w obiekcie", value: inHouse },
    { label: "Oczekujące wpłaty", value: pending },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pulpit</h1>
        <Link
          href="/admin/rezerwacje/nowa"
          className="bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-4 py-2 text-sm"
        >
          + Nowa rezerwacja
        </Link>
      </div>

      {unreadMessages > 0 && (
        <Link
          href="/admin/rezerwacje"
          className="block bg-accent-100 border border-accent-400/50 text-accent-700 rounded-xl px-5 py-3 text-sm font-semibold hover:bg-accent-100/70"
        >
          💬 {unreadMessages}{" "}
          {unreadMessages === 1
            ? "nieprzeczytana wiadomość od gościa"
            : "nieprzeczytane wiadomości od gości"}{" "}
          — zobacz w Rezerwacjach →
        </Link>
      )}

      {conflicts.length > 0 && (
        <Link
          href="/admin/kanaly"
          className="block bg-red-50 border border-red-300 text-red-800 rounded-xl px-5 py-3 text-sm font-semibold hover:bg-red-100"
        >
          ⚠ {conflicts.length}{" "}
          {conflicts.length === 1
            ? "możliwa podwójna rezerwacja"
            : "możliwe podwójne rezerwacje"}{" "}
          między kanałem a rezerwacją bezpośrednią — zobacz w Kanałach →
        </Link>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-3xl font-bold">{s.value}</p>
            <p className="text-sm text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <h2 className="font-semibold px-5 pt-4">Najbliższe pobyty</h2>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-5 py-2 font-medium">Kod</th>
              <th className="px-5 py-2 font-medium">Gość</th>
              <th className="px-5 py-2 font-medium">Pokój</th>
              <th className="px-5 py-2 font-medium">Termin</th>
              <th className="px-5 py-2 font-medium">Kwota</th>
              <th className="px-5 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-5 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-5 py-2">
                  {r.guestName}
                  {r.checkInStatus === "COMPLETED" && (
                    <span
                      className="ml-1.5 text-emerald-700 text-xs font-semibold"
                      title="Karta meldunkowa wypełniona online"
                    >
                      ✓ meldunek
                    </span>
                  )}
                </td>
                <td className="px-5 py-2">
                  {r.unit.unitType.name} ({r.unit.name})
                </td>
                <td className="px-5 py-2">
                  {formatDateShortPl(r.checkIn)} → {formatDateShortPl(r.checkOut)}
                </td>
                <td className="px-5 py-2">{formatPln(r.totalGr)}</td>
                <td className="px-5 py-2">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
            {upcoming.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-slate-400">
                  Brak nadchodzących pobytów
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
