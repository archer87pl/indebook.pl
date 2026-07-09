import Link from "next/link";
import { requireOwner } from "@/lib/auth";
import { formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { invoiceKindDef } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const { property } = await requireOwner();
  const invoices = await prisma.invoice.findMany({
    where: { propertyId: property.id },
    include: { reservation: { select: { id: true, code: true } } },
    orderBy: { id: "desc" },
  });
  const grossSum = invoices.reduce((s, i) => s + i.grossGr, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">
          Faktury{" "}
          <span className="text-slate-400 text-base font-normal">
            ({invoices.length})
          </span>
        </h1>
        {invoices.length > 0 && (
          <span className="text-sm text-slate-500">
            Suma brutto: <span className="font-semibold">{formatPln(grossSum)}</span>
          </span>
        )}
      </div>

      {!property.sellerNip && (
        <p className="alert-warning">
          Aby wystawiać faktury, uzupełnij dane sprzedawcy (NIP) w{" "}
          <Link href="/admin/obiekt" className="font-semibold underline">
            ustawieniach obiektu
          </Link>
          . Fakturę wystawisz z poziomu rezerwacji.
        </p>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="px-4 py-3 font-medium">Numer</th>
              <th className="px-4 py-3 font-medium">Rodzaj</th>
              <th className="px-4 py-3 font-medium">Nabywca</th>
              <th className="px-4 py-3 font-medium">Wystawiono</th>
              <th className="px-4 py-3 font-medium">Brutto</th>
              <th className="px-4 py-3 font-medium">Rezerwacja</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-mono font-semibold">{inv.number}</td>
                <td className="px-4 py-3">
                  {invoiceKindDef(inv.kind)?.label ?? inv.kind}
                </td>
                <td className="px-4 py-3">
                  {inv.buyerName}
                  {inv.buyerNip && (
                    <p className="text-xs text-slate-400">NIP {inv.buyerNip}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDateShortPl(inv.issueDate)}
                </td>
                <td className="px-4 py-3">{formatPln(inv.grossGr)}</td>
                <td className="px-4 py-3">
                  {inv.reservation ? (
                    <Link
                      href={`/admin/rezerwacje/${inv.reservation.id}`}
                      className="font-mono text-xs text-brand-700 hover:underline"
                    >
                      {inv.reservation.code}
                    </Link>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/faktury/${inv.id}`}
                    className="text-brand-700 font-semibold hover:underline whitespace-nowrap"
                  >
                    Podgląd →
                  </Link>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Brak faktur — wystaw pierwszą z poziomu rezerwacji.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
