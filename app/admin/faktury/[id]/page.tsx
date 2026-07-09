import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
import { deleteInvoice } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDatePl } from "@/lib/dates";
import { formatPln } from "@/lib/format";
import { invoiceKindDef } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function InvoicePage(props: {
  params: Promise<{ id: string }>;
}) {
  const { property } = await requireOwner();
  const { id } = await props.params;

  const invoice = await prisma.invoice.findUnique({ where: { id: Number(id) } });
  if (!invoice || invoice.propertyId !== property.id) notFound();

  const kindLabel = invoiceKindDef(invoice.kind)?.label ?? "Faktura";
  const cell = "px-3 py-2 border border-slate-300 text-sm";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">
          {kindLabel} <span className="font-mono">{invoice.number}</span>
        </h1>
        <div className="flex items-center gap-3">
          <PrintButton />
          <Link href="/admin/faktury" className="text-sm text-slate-500 hover:underline">
            ← Rejestr faktur
          </Link>
        </div>
      </div>

      <div className="card p-8 space-y-6 print:shadow-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-brand-950">{kindLabel}</p>
            <p className="font-mono text-sm">{invoice.number}</p>
          </div>
          <div className="text-right text-sm">
            <p>
              <span className="text-slate-500">Data wystawienia:</span>{" "}
              {formatDatePl(invoice.issueDate)}
            </p>
            <p>
              <span className="text-slate-500">Data sprzedaży:</span>{" "}
              {formatDatePl(invoice.saleDate)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sprzedawca
            </p>
            <p className="font-semibold">{invoice.sellerName}</p>
            {invoice.sellerAddress && <p>{invoice.sellerAddress}</p>}
            {invoice.sellerNip && <p>NIP: {invoice.sellerNip}</p>}
            {invoice.bankAccount && (
              <p className="text-slate-500">Konto: {invoice.bankAccount}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Nabywca
            </p>
            <p className="font-semibold">{invoice.buyerName}</p>
            {invoice.buyerAddress && <p>{invoice.buyerAddress}</p>}
            {invoice.buyerNip && <p>NIP: {invoice.buyerNip}</p>}
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${cell} text-left`}>Nazwa</th>
              <th className={`${cell} text-right`}>Netto</th>
              <th className={`${cell} text-right`}>VAT {invoice.vatRate}%</th>
              <th className={`${cell} text-right`}>Brutto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cell}>{invoice.itemName}</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.netGr)}</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.vatGr)}</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.grossGr)}</td>
            </tr>
            <tr className="font-bold">
              <td className={`${cell} text-right`}>Razem</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.netGr)}</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.vatGr)}</td>
              <td className={`${cell} text-right`}>{formatPln(invoice.grossGr)}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="text-right">
            <p className="text-sm text-slate-500">Do zapłaty</p>
            <p className="text-2xl font-black text-brand-950">
              {formatPln(invoice.grossGr)}
            </p>
          </div>
        </div>

        {invoice.kind === "PROFORMA" && (
          <p className="text-xs text-slate-500">
            Dokument proforma nie jest fakturą VAT i nie stanowi podstawy do
            odliczenia podatku.
          </p>
        )}
      </div>

      <form
        action={deleteInvoice}
        className="print:hidden text-right"
      >
        <input type="hidden" name="id" value={invoice.id} />
        <input type="hidden" name="back" value="/admin/faktury" />
        <button className="text-sm text-red-600 hover:underline">
          Usuń fakturę
        </button>
      </form>
    </div>
  );
}
