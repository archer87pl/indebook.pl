import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
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
      {!property.sellerNip && (
        <p className="alert-warning">
          Aby wystawiać faktury, uzupełnij dane sprzedawcy (NIP) w{" "}
          <Link href="/admin/obiekt" className="font-semibold underline">
            ustawieniach obiektu
          </Link>
          . Fakturę wystawisz z poziomu rezerwacji.
        </p>
      )}

      <Card>
        <CardHeader
          title="Rejestr faktur"
          sub={`${invoices.length} ${invoices.length === 1 ? "dokument" : "dokumentów"}`}
          action={
            invoices.length > 0 && (
              <span className="text-[12.5px] text-slate-500">
                Suma brutto{" "}
                <span className="tnum font-semibold text-slate-900">
                  {formatPln(grossSum)}
                </span>
              </span>
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="cards-sm w-full text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left">
                <th className="th px-[18px] py-2.5">Numer</th>
                <th className="th px-2 py-2.5">Rodzaj</th>
                <th className="th px-2 py-2.5">Nabywca</th>
                <th className="th px-2 py-2.5">Wystawiono</th>
                <th className="th px-2 py-2.5 text-right">Brutto</th>
                <th className="th px-2 py-2.5">Rezerwacja</th>
                <th className="th px-[18px] py-2.5"></th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              {invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-t border-slate-100 transition-colors hover:bg-slate-50"
                >
                  <td data-label="Numer" className="tnum whitespace-nowrap px-[18px] py-2.5 text-[11px] font-semibold text-brand-600">
                    {inv.number}
                  </td>
                  <td data-label="Rodzaj" className="px-2 py-2.5">
                    {invoiceKindDef(inv.kind)?.label ?? inv.kind}
                  </td>
                  <td data-label="Nabywca" className="px-2 py-2.5">
                    <span className="font-semibold text-slate-900">
                      {inv.buyerName}
                    </span>
                    {inv.buyerNip && (
                      <p className="tnum text-[11px] text-slate-400">
                        NIP {inv.buyerNip}
                      </p>
                    )}
                  </td>
                  <td data-label="Wystawiono" className="whitespace-nowrap px-2 py-2.5 text-slate-500">
                    {formatDateShortPl(inv.issueDate)}
                  </td>
                  <td data-label="Brutto" className="tnum whitespace-nowrap px-2 py-2.5 text-right font-semibold text-slate-900">
                    {formatPln(inv.grossGr)}
                  </td>
                  <td data-label="Rezerwacja" className="px-2 py-2.5">
                    {inv.reservation ? (
                      <Link
                        href={`/admin/rezerwacje/${inv.reservation.id}`}
                        className="tnum text-[11px] font-semibold text-brand-600 hover:underline"
                      >
                        {inv.reservation.code}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-[18px] py-2.5 text-right">
                    <Link
                      href={`/admin/faktury/${inv.id}`}
                      className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold text-brand-700 hover:underline"
                    >
                      Podgląd <ArrowRight size={13} strokeWidth={2} />
                    </Link>
                  </td>
                </tr>
              ))}
              {invoices.length === 0 && (
                <tr className="border-t border-slate-100">
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={<FileText size={26} strokeWidth={2} />}
                      title="Brak faktur"
                      description="Wystaw pierwszą fakturę z poziomu rezerwacji."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
