import type { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { nightsBetween } from "@/lib/dates";
import { prisma } from "@/lib/db";

const BOM = String.fromCharCode(0xfeff);
const BATCH = 500;

function esc(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function zl(gr: number): string {
  return (gr / 100).toFixed(2).replace(".", ",");
}

const HEADER = [
  "Kod",
  "Status",
  "Źródło",
  "Typ pokoju",
  "Jednostka",
  "Przyjazd",
  "Wyjazd",
  "Noce",
  "Goście",
  "Gość",
  "E-mail",
  "Telefon",
  "NIP",
  "Kod promocyjny",
  "Meldunek online",
  "Rabat [zł]",
  "Kwota [zł]",
  "Zaliczka [zł]",
  "Utworzono",
];

type Row = Prisma.ReservationGetPayload<{
  include: { unit: { include: { unitType: true } } };
}>;

function rowFor(r: Row): string {
  return [
    r.code,
    r.status,
    r.source,
    r.unit.unitType.name,
    r.unit.name,
    r.checkIn,
    r.checkOut,
    String(nightsBetween(r.checkIn, r.checkOut)),
    String(r.guests),
    r.guestName,
    r.email,
    r.phone,
    r.nip,
    r.promoCode,
    // celowo tylko TAK/NIE — dane karty meldunkowej nie trafiają do CSV (RODO)
    r.checkInStatus === "COMPLETED" ? "TAK" : "NIE",
    zl(r.discountGr),
    zl(r.totalGr),
    zl(r.depositGr),
    r.createdAt.toISOString().slice(0, 19).replace("T", " "),
  ]
    .map(esc)
    .join(";");
}

// Eksport rezerwacji obiektu do CSV (Excel PL: średnik + BOM).
// Strumieniowany kursorem po `id` — do pamięci trafia najwyżej BATCH wierszy
// naraz, więc eksport nie rośnie liniowo z całą historią obiektu.
export async function GET() {
  const user = await getSessionUser();
  if (!user?.property) return new Response("Unauthorized", { status: 401 });
  const propertyId = user.property.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(BOM + HEADER.join(";") + "\r\n"));
      let cursor: number | undefined;
      for (;;) {
        const batch = await prisma.reservation.findMany({
          where: { unit: { unitType: { propertyId } } },
          include: { unit: { include: { unitType: true } } },
          orderBy: { id: "desc" },
          take: BATCH,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        });
        if (batch.length === 0) break;
        controller.enqueue(
          encoder.encode(batch.map(rowFor).join("\r\n") + "\r\n"),
        );
        cursor = batch[batch.length - 1]!.id;
        if (batch.length < BATCH) break;
      }
      controller.close();
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rezerwacje-${user.property.slug}-${today}.csv"`,
    },
  });
}
