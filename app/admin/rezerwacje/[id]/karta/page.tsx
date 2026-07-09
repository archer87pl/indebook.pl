import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/PrintButton";
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
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5 border-b border-slate-100 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">Karta meldunkowa</h1>
        <div className="flex items-center gap-3">
          <PrintButton />
          <Link
            href={`/admin/rezerwacje/${reservation.id}`}
            className="text-sm text-slate-500 hover:underline"
          >
            ← Wróć do rezerwacji
          </Link>
        </div>
      </div>

      <div className="card p-8 space-y-5 print:shadow-none print:border-0 print:p-0">
        <div className="text-center space-y-1">
          <p className="text-lg font-bold text-brand-950">{property.name}</p>
          {property.address && (
            <p className="text-xs text-slate-500">{property.address}</p>
          )}
          <p className="text-sm font-semibold uppercase tracking-widest pt-2">
            Karta meldunkowa
          </p>
        </div>

        <div>
          {row("Rezerwacja", reservation.code)}
          {row(
            "Pobyt",
            `${formatDatePl(reservation.checkIn)} → ${formatDatePl(reservation.checkOut)}`
          )}
          {row(
            "Pokój",
            `${reservation.unit.unitType.name} (${reservation.unit.name})`
          )}
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
          {row("Planowany przyjazd", card.arrivalTime)}
          {row("E-mail", reservation.email)}
          {row("Telefon", reservation.phone)}
        </div>

        {additionalGuests.length > 0 && (
          <div>
            <p className="text-sm font-semibold pb-1">Pozostali goście</p>
            {additionalGuests.map((g, i) =>
              row(
                `Gość ${i + 2}`,
                `${g.name}${g.birthDate ? ` (ur. ${formatDateShortPl(g.birthDate)})` : ""}`
              )
            )}
          </div>
        )}

        <div className="text-xs text-slate-500 space-y-1">
          <p>
            ✓ Gość zaakceptował regulamin obiektu i wyraził zgodę na
            przetwarzanie danych (RODO).
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

        <div className="pt-4">
          <p className="text-xs text-slate-500 pb-1">Podpis gościa</p>
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
