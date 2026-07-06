import { prisma } from "@/lib/db";

// Eksport iCal per jednostka — do podpięcia w Booking.com/Airbnb.
// URL zawiera sekret (?t=token), żeby dostępność nie była publicznie zgadywalna.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ unitId: string }> }
) {
  const { unitId } = await ctx.params;
  const token = new URL(req.url).searchParams.get("t") ?? "";
  const unit = await prisma.unit.findUnique({
    where: { id: Number(unitId) },
    include: {
      unitType: true,
      reservations: { where: { status: "CONFIRMED" } },
      blocks: { where: { source: "MANUAL" } },
    },
  });
  if (!unit) return new Response("Not found", { status: 404 });
  if (!unit.icalToken || token !== unit.icalToken)
    return new Response("Forbidden", { status: 403 });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const toIcs = (iso: string) => iso.replaceAll("-", "");

  const events = [
    ...unit.reservations.map(
      (r) =>
        `BEGIN:VEVENT\r\nUID:res-${r.code}@notelo\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${toIcs(r.checkIn)}\r\nDTEND;VALUE=DATE:${toIcs(r.checkOut)}\r\nSUMMARY:Rezerwacja ${r.code}\r\nEND:VEVENT`
    ),
    ...unit.blocks.map(
      (b) =>
        `BEGIN:VEVENT\r\nUID:block-${b.id}@notelo\r\nDTSTAMP:${stamp}\r\nDTSTART;VALUE=DATE:${toIcs(b.startDate)}\r\nDTEND;VALUE=DATE:${toIcs(b.endDate)}\r\nSUMMARY:Niedostępne\r\nEND:VEVENT`
    ),
  ];

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//Notelo//${unit.name}//PL`,
    "CALSCALE:GREGORIAN",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="notelo-unit-${unit.id}.ics"`,
    },
  });
}
