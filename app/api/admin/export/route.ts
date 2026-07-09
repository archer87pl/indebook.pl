import { getSessionUser } from "@/lib/auth";
import { nightsBetween } from "@/lib/dates";
import { prisma } from "@/lib/db";

const BOM = String.fromCharCode(0xfeff);

function esc(v: string): string {
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function zl(gr: number): string {
  return (gr / 100).toFixed(2).replace(".", ",");
}

// Eksport rezerwacji obiektu do CSV (Excel PL: średnik + BOM).
export async function GET() {
  const user = await getSessionUser();
  if (!user?.property) return new Response("Unauthorized", { status: 401 });

  const reservations = await prisma.reservation.findMany({
    where: { unit: { unitType: { propertyId: user.property.id } } },
    include: { unit: { include: { unitType: true } } },
    orderBy: { createdAt: "desc" },
  });

  const header = [
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
  const rows = reservations.map((r) =>
    [
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
      .join(";")
  );
  const csv = BOM + [header.join(";"), ...rows].join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rezerwacje-${user.property.slug}-${today}.csv"`,
    },
  });
}
