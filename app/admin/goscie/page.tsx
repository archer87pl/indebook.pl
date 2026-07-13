import Link from "next/link";
import { Search, Star } from "lucide-react";
import Badge from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { averageRating } from "@/lib/reviews";

export const dynamic = "force-dynamic";

type GuestRow = {
  name: string;
  email: string;
  phone: string;
  stays: number;
  cancelled: number;
  totalSpentGr: number;
  lastStay: string;
  checkedInOnline: boolean;
};

/** Tag gościa wg 10b: VIP (3+ pobyty lub 3000+ zł), Powracający (2+), Nowy. */
function guestTag(g: GuestRow) {
  if (g.stays >= 3 || g.totalSpentGr >= 300_000) return <Badge tone="success">VIP</Badge>;
  if (g.stays >= 2) return <Badge tone="neutral">Powracający</Badge>;
  return <Badge tone="warning">Nowy</Badge>;
}

// Goście (10b): baza CRM zbudowana z rezerwacji — grupowanie po e-mailu
// (bez własnego modelu gościa; adres e-mail identyfikuje osobę).
export default async function GuestsPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();

  const [reservations, reviews] = await prisma.$transaction([
    prisma.reservation.findMany({
      where: { unit: { unitType: { propertyId: property.id } } },
      select: {
        guestName: true,
        email: true,
        phone: true,
        status: true,
        totalGr: true,
        checkIn: true,
        checkInStatus: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.review.findMany({
      where: { propertyId: property.id, hidden: false },
      select: { rating: true },
    }),
  ]);

  // agregacja po e-mailu; rezerwacje bez żywego adresu grupujemy po nazwisko+telefon
  const byKey = new Map<string, GuestRow>();
  for (const r of reservations) {
    const liveEmail = r.email && !r.email.endsWith("@rezio.local");
    const key = liveEmail
      ? r.email.toLowerCase()
      : `${r.guestName.toLowerCase()}|${r.phone}`;
    const row = byKey.get(key) ?? {
      name: r.guestName,
      email: liveEmail ? r.email : "",
      phone: r.phone,
      stays: 0,
      cancelled: 0,
      totalSpentGr: 0,
      lastStay: r.checkIn,
      checkedInOnline: false,
    };
    // najnowsze dane kontaktowe wygrywają
    row.name = r.guestName;
    if (liveEmail) row.email = r.email;
    if (r.phone) row.phone = r.phone;
    if (r.status === "CONFIRMED") {
      row.stays += 1;
      row.totalSpentGr += r.totalGr;
      if (r.checkIn > row.lastStay) row.lastStay = r.checkIn;
    }
    if (r.status === "CANCELLED") row.cancelled += 1;
    if (r.checkInStatus === "COMPLETED") row.checkedInOnline = true;
    byKey.set(key, row);
  }

  const all = [...byKey.values()].filter((g) => g.stays > 0 || g.cancelled > 0);
  const guests = (
    q
      ? all.filter(
          (g) =>
            g.name.toLowerCase().includes(q) ||
            g.email.toLowerCase().includes(q) ||
            g.phone.toLowerCase().includes(q),
        )
      : all
  ).sort((a, b) => b.totalSpentGr - a.totalSpentGr);

  const returning = all.filter((g) => g.stays >= 2).length;
  const checkedIn = all.filter((g) => g.checkedInOnline).length;
  const avg = averageRating(reviews.map((r) => r.rating));

  return (
    <div className="space-y-4">
      {/* KPI (10b) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Wszyscy goście" value={all.length} />
        <KpiCard
          label="Powracający"
          value={returning}
          sub={all.length > 0 ? `${Math.round((returning / all.length) * 100)}% bazy` : undefined}
        />
        <KpiCard
          label="Z meldunkiem online"
          value={checkedIn}
          sub="potwierdzony e-mail i dane"
        />
        <KpiCard
          label="Śr. ocena pobytu"
          value={reviews.length > 0 ? avg.toFixed(1).replace(".", ",") : "—"}
          sub={reviews.length > 0 ? `${reviews.length} opinii` : "brak opinii"}
        />
      </div>

      <Card>
        <CardHeader
          title="Baza gości"
          sub="budowana automatycznie z potwierdzonych rezerwacji"
          action={
            <form action="/admin/goscie" role="search">
              <div className="flex h-9 w-[240px] items-center gap-2 rounded-[10px] border border-slate-200 bg-white px-3 text-slate-400 focus-within:border-brand-600">
                <Search size={14} strokeWidth={2} />
                <input
                  type="search"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder="Imię, e-mail, telefon…"
                  className="w-full bg-transparent text-[12.5px] text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </form>
          }
        />
        {guests.length === 0 ? (
          <EmptyState
            icon={<Star size={26} strokeWidth={2} />}
            title={q ? `Brak gości dla „${sp.q}”` : "Baza gości jest jeszcze pusta"}
            description={
              q
                ? "Spróbuj innej frazy — szukamy po imieniu, e-mailu i telefonie."
                : "Goście pojawią się tu automatycznie wraz z pierwszymi potwierdzonymi rezerwacjami."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="th px-[18px] py-2.5">Gość</th>
                  <th className="th px-2 py-2.5">Kontakt</th>
                  <th className="th px-2 py-2.5 text-center">Pobyty</th>
                  <th className="th px-2 py-2.5 text-right">Wydał łącznie</th>
                  <th className="th px-2 py-2.5">Ostatni pobyt</th>
                  <th className="th px-2 py-2.5">Tag</th>
                  <th className="th px-[18px] py-2.5" />
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr
                    key={`${g.email}|${g.name}|${g.phone}`}
                    className="border-t border-slate-100 align-middle transition-colors hover:bg-slate-50"
                  >
                    <td className="px-[18px] py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-brand-600 text-xs font-bold text-white">
                          {g.name
                            .split(/\s+/)
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase())
                            .join("")}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{g.name}</div>
                          {g.checkedInOnline && (
                            <div className="text-[10.5px] font-semibold text-info-600">
                              meldunek online ✓
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      <div className="truncate">{g.email || "—"}</div>
                      {g.phone && (
                        <div className="tnum text-[11px] text-slate-400">{g.phone}</div>
                      )}
                    </td>
                    <td className="tnum px-2 py-2.5 text-center font-semibold">
                      {g.stays}
                      {g.cancelled > 0 && (
                        <span
                          className="font-normal text-slate-400"
                          title="Anulowane rezerwacje"
                        >
                          {" "}
                          (+{g.cancelled} anul.)
                        </span>
                      )}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right font-semibold">
                      {formatPln(g.totalSpentGr)}
                    </td>
                    <td className="tnum px-2 py-2.5 text-slate-600">
                      {g.lastStay
                        ? new Date(`${g.lastStay}T00:00:00`).toLocaleDateString("pl-PL", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="px-2 py-2.5">{guestTag(g)}</td>
                    <td className="px-[18px] py-2.5 text-right">
                      <Link
                        href={`/admin/rezerwacje?q=${encodeURIComponent(g.email || g.name)}`}
                        className="whitespace-nowrap text-xs font-semibold text-brand-600 hover:underline"
                      >
                        Rezerwacje →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
