import Link from "next/link";
import { Download, FileText, Settings } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import KpiCard from "@/components/ui/KpiCard";
import { requireOwner } from "@/lib/auth";
import { addDaysISO, formatRangeShortPl, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

// Płatności (10a): rejestr rozliczeń zbudowany z rezerwacji — zaliczki online
// (Przelewy24 / symulacja), potwierdzenia ręczne i oczekujące wpłaty.
export default async function PaymentsPage() {
  const { property } = await requireOwner();
  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart = addDaysISO(monthStart, 32).slice(0, 7) + "-01";
  const inProperty = { unit: { unitType: { propertyId: property.id } } };

  const [monthRevenue, paidOnline, manualConfirmed, pending, transactions] =
    await prisma.$transaction([
      prisma.reservation.aggregate({
        where: {
          ...inProperty,
          status: "CONFIRMED",
          checkIn: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { totalGr: true },
      }),
      prisma.reservation.aggregate({
        where: { ...inProperty, status: "CONFIRMED", paymentOrderId: { not: "" } },
        _sum: { depositGr: true },
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: {
          ...inProperty,
          status: "CONFIRMED",
          paymentOrderId: "",
          source: "MANUAL",
        },
        _sum: { totalGr: true },
        _count: { _all: true },
      }),
      prisma.reservation.aggregate({
        where: { ...inProperty, status: "PENDING", expiresAt: { gt: new Date() } },
        _sum: { depositGr: true },
        _count: { _all: true },
      }),
      prisma.reservation.findMany({
        where: {
          ...inProperty,
          OR: [
            { paymentOrderId: { not: "" } },
            { status: "PENDING" },
            { status: "CONFIRMED", source: "MANUAL" },
          ],
        },
        include: { unit: { include: { unitType: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

  const monthLabel = new Date().toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-[9px] bg-slate-100 p-0.5">
          <span className="rounded-md bg-white px-3 py-1.5 text-[11.5px] font-bold text-brand-900 shadow-sm">
            Transakcje
          </span>
          <Link
            href="/admin/faktury"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-bold text-slate-500 hover:text-slate-900"
          >
            <FileText size={12} strokeWidth={2} /> Faktury
          </Link>
          <Link
            href="/admin/platnosci/konfiguracja"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-bold text-slate-500 hover:text-slate-900"
          >
            <Settings size={12} strokeWidth={2} /> Konfiguracja
          </Link>
        </div>
        <Button variant="quiet" href="/api/admin/export">
          <Download size={14} strokeWidth={2} /> Eksport CSV
        </Button>
      </div>

      {/* KPI (10a) */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          dark
          label={`Przychód · ${monthLabel}`}
          value={formatPln(monthRevenue._sum.totalGr ?? 0)}
          sub="0 zł prowizji"
        />
        <KpiCard
          label="Zaliczki opłacone online"
          value={formatPln(paidOnline._sum.depositGr ?? 0)}
          sub={`${paidOnline._count._all} transakcji`}
        />
        <KpiCard
          label="Potwierdzone ręcznie"
          value={formatPln(manualConfirmed._sum.totalGr ?? 0)}
          sub={`${manualConfirmed._count._all} rezerwacji · płatność na miejscu`}
        />
        <div className="rounded-[14px] border border-accent-200 bg-[#fdf6ea] px-4 py-[15px]">
          <div className="text-xs font-semibold text-[#9a7830]">Oczekuje na płatność</div>
          <div className="nums mt-2 text-[26px] font-bold leading-none tracking-[-0.02em] text-accent-700">
            {formatPln(pending._sum.depositGr ?? 0)}
          </div>
          <div className="mt-1.5 text-[11.5px] text-accent-500">
            {pending._count._all}{" "}
            {pending._count._all === 1 ? "rezerwacja czeka" : "rezerwacje czekają"} na
            zaliczkę
          </div>
        </div>
      </div>

      {/* Rejestr transakcji */}
      <Card>
        <CardHeader
          title="Transakcje"
          sub="zaliczki online, potwierdzenia ręczne i oczekujące wpłaty (ostatnie 50)"
        />
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Data</th>
                <th className="th px-2 py-2.5">Gość / rezerwacja</th>
                <th className="th px-2 py-2.5">Termin</th>
                <th className="th px-2 py-2.5">Metoda</th>
                <th className="th px-2 py-2.5">Typ</th>
                <th className="th px-2 py-2.5 text-right">Kwota</th>
                <th className="th px-[18px] py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((r) => {
                const online = r.paymentOrderId !== "";
                const active =
                  r.status === "PENDING" && r.expiresAt && r.expiresAt > new Date();
                return (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                  >
                    <td className="tnum px-[18px] py-2.5 text-slate-600">
                      {r.createdAt.toLocaleString("pl-PL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="font-semibold">{r.guestName}</span>{" "}
                      <Link
                        href={`/admin/rezerwacje/${r.id}`}
                        className="tnum text-[10.5px] text-brand-600 hover:underline"
                      >
                        {r.code}
                      </Link>
                    </td>
                    <td className="tnum px-2 py-2.5 text-slate-600">
                      {formatRangeShortPl(r.checkIn, r.checkOut)}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {online ? "Przelewy24" : r.source === "MANUAL" ? "na miejscu" : "—"}
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {online || r.status === "PENDING" ? "Zaliczka" : "Pełna kwota"}
                    </td>
                    <td className="tnum px-2 py-2.5 text-right font-semibold">
                      {formatPln(
                        online || r.status === "PENDING" ? r.depositGr : r.totalGr,
                      )}
                    </td>
                    <td className="px-[18px] py-2.5 text-right">
                      {r.status === "CONFIRMED" ? (
                        <Badge tone="success">
                          {online ? "Zaksięgowana" : "Potwierdzona ręcznie"}
                        </Badge>
                      ) : r.status === "PENDING" ? (
                        active ? (
                          <Badge tone="warning">Oczekuje</Badge>
                        ) : (
                          <Badge tone="neutral">Wygasła</Badge>
                        )
                      ) : (
                        <Badge tone="danger">Anulowana</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-[18px] py-8 text-center text-slate-400">
                    Brak transakcji — pojawią się wraz z pierwszymi rezerwacjami.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-slate-400">
        Rejestr budowany z rezerwacji: zaliczki online przez Przelewy24 potwierdzają
        rezerwację automatycznie, rezerwacje ręczne rozliczane są na miejscu. Faktury
        VAT znajdziesz w zakładce{" "}
        <Link href="/admin/faktury" className="font-semibold text-brand-600 hover:underline">
          Faktury
        </Link>
        .
      </p>
    </div>
  );
}
