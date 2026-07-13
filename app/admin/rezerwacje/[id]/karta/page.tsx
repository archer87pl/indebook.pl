import { ArrowLeft, Check } from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import PrintButton from "@/components/PrintButton";
import Button from "@/components/ui/Button";
import { requireOwner } from "@/lib/auth";
import { type AdditionalGuest, docTypeLabel } from "@/lib/checkin";
import { formatDatePl, formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Karta meldunkowa do podglądu i wydruku — pełne dane (w tym numer dokumentu
// i podpis) widoczne wyłącznie dla właściciela obiektu.
export default async function CheckInCardPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { property } = await requireOwner();
  const { id } = await props.params;

  const reservation = await prisma.reservation.findUnique({
    where: { id: Number(id) },
    include: {
      checkInCard: true,
      unit: { include: { unitType: { include: { property: true } } } },
    },
  });
  if (
    !reservation ||
    reservation.unit.unitType.propertyId !== property.id ||
    !reservation.checkInCard
  )
    notFound();

  const card = reservation.checkInCard;
  let additionalGuests: AdditionalGuest[] = [];
  try {
    additionalGuests = JSON.parse(card.guestsJson);
  } catch {
    additionalGuests = [];
  }

  const row = (label: string, value: string) => (
    <div className="grid grid-cols-[160px_1fr] gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );

  const section = (title: string, children: ReactNode) => (
    <div className="rounded-[10px] border border-slate-200 px-4 pb-1.5 pt-3">
      <p className="th pb-1">{title}</p>
      {children}
    </div>
  );

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-[15px] font-bold">Karta meldunkowa</h2>
          <p className="tnum text-[11.5px] text-slate-400">{reservation.code}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button href={`/admin/rezerwacje/${reservation.id}`} variant="quiet" size="sm">
            <ArrowLeft size={13} strokeWidth={2} />
            Wróć do rezerwacji
          </Button>
          <PrintButton label="Drukuj" />
        </div>
      </div>

      <div className="card space-y-5 p-8 print:border-0 print:p-0 print:shadow-none">
        {/* Nagłówek dokumentu */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-[17px] font-bold leading-tight text-brand-950">
              {property.name}
            </p>
            {property.address && (
              <p className="text-xs text-slate-500">{property.address}</p>
            )}
          </div>
          <div className="flex-none text-right">
            <p className="text-sm font-bold tracking-[-0.02em]">Rezio</p>
            <p className="tnum text-xs text-slate-500">{reservation.code}</p>
          </div>
        </div>

        <p className="text-center text-sm font-bold uppercase tracking-[0.18em]">
          Karta meldunkowa
        </p>

        {section(
          "Pobyt",
          <>
            {row("Rezerwacja", reservation.code)}
            {row(
              "Pobyt",
              `${formatDatePl(reservation.checkIn)} → ${formatDatePl(reservation.checkOut)}`
            )}
            {row(
              "Pokój",
              `${reservation.unit.unitType.name} (${reservation.unit.name})`
            )}
            {row("Planowany przyjazd", card.arrivalTime)}
          </>
        )}

        {section(
          "Gość główny",
          <>
            {row("Imię i nazwisko", card.fullName)}
            {row("Adres zamieszkania", card.address)}
            {row("Obywatelstwo", card.citizenship)}
            {row(
              "Dokument tożsamości",
              card.docNumber
                ? `${docTypeLabel(card.docType)} nr ${card.docNumber}`
                : "nie podano"
            )}
            {row("Nr rejestracyjny auta", card.carPlate)}
            {row("E-mail", reservation.email)}
            {row("Telefon", reservation.phone)}
          </>
        )}

        {additionalGuests.length > 0 &&
          section(
            "Pozostali goście",
            additionalGuests.map((g, i) =>
              row(
                `Gość ${i + 2}`,
                `${g.name}${g.birthDate ? ` (ur. ${formatDateShortPl(g.birthDate)})` : ""}`
              )
            )
          )}

        <div className="space-y-1 text-xs text-slate-500">
          <p className="flex items-start gap-1.5">
            <Check size={13} strokeWidth={2.5} className="mt-px flex-none" />
            Gość zaakceptował regulamin obiektu i wyraził zgodę na przetwarzanie
            danych (RODO).
          </p>
          <p>
            Kartę wypełniono online{" "}
            {card.completedAt.toLocaleString("pl-PL", {
              dateStyle: "long",
              timeStyle: "short",
            })}
            .
          </p>
        </div>

        <div className="pt-2">
          <p className="th pb-1.5">Podpis gościa</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.signaturePng}
            alt="Podpis gościa"
            className="h-24 border-b border-slate-300"
          />
        </div>
      </div>
    </div>
  );
}
