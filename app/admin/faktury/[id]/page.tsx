import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
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
  const cell = "px-3 py-2 border border-slate-300 text-[13px]";

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h2 className="text-[15px] font-bold">
          {kindLabel}{" "}
          <span className="tnum text-[13px] font-semibold text-brand-600">
            {invoice.number}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/faktury"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-500 hover:text-slate-900 hover:underline"
          >
            <ArrowLeft size={13} strokeWidth={2} /> Rejestr faktur
          </Link>
          <PrintButton label="Drukuj" />
        </div>
      </div>

      <div className="card p-8 space-y-6 print:shadow-none print:border-0 print:p-0">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-bold text-slate-900">{kindLabel}</p>
            <p className="tnum text-sm text-slate-600">{invoice.number}</p>
          </div>
          <div className="text-right text-[13px] text-slate-900">
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

        <div className="grid grid-cols-2 gap-6 text-[13px] text-slate-900">
          <div className="space-y-1">
            <p className="th">Sprzedawca</p>
            <p className="font-semibold">{invoice.sellerName}</p>
            {invoice.sellerAddress && <p>{invoice.sellerAddress}</p>}
            {invoice.sellerNip && <p className="tnum">NIP: {invoice.sellerNip}</p>}
            {invoice.bankAccount && (
              <p className="tnum text-slate-500">Konto: {invoice.bankAccount}</p>
            )}
          </div>
          <div className="space-y-1">
            <p className="th">Nabywca</p>
            <p className="font-semibold">{invoice.buyerName}</p>
            {invoice.buyerAddress && <p>{invoice.buyerAddress}</p>}
            {invoice.buyerNip && <p className="tnum">NIP: {invoice.buyerNip}</p>}
          </div>
        </div>

        <table className="w-full border-collapse text-slate-900">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${cell} th text-left`}>Nazwa</th>
              <th className={`${cell} th text-right`}>Netto</th>
              <th className={`${cell} th text-right`}>VAT {invoice.vatRate}%</th>
              <th className={`${cell} th text-right`}>Brutto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={cell}>{invoice.itemName}</td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.netGr)}
              </td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.vatGr)}
              </td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.grossGr)}
              </td>
            </tr>
            <tr className="font-bold">
              <td className={`${cell} text-right`}>Razem</td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.netGr)}
              </td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.vatGr)}
              </td>
              <td className={`${cell} tnum text-right`}>
                {formatPln(invoice.grossGr)}
              </td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-end">
          <div className="text-right">
            <p className="text-[13px] text-slate-500">Do zapłaty</p>
            <p className="tnum text-2xl font-bold text-slate-900">
              {formatPln(invoice.grossGr)}
            </p>
          </div>
        </div>

        {invoice.kind === "PROFORMA" && (
          <p className="text-[11px] text-slate-500">
            Dokument proforma nie jest fakturą VAT i nie stanowi podstawy do
            odliczenia podatku.
          </p>
        )}
      </div>

      <form action={deleteInvoice} className="print:hidden text-right">
        <input type="hidden" name="id" value={invoice.id} />
        <input type="hidden" name="back" value="/admin/faktury" />
        <button className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-danger-600 hover:underline">
          <Trash2 size={13} strokeWidth={2} /> Usuń fakturę
        </button>
      </form>
    </div>
  );
}
