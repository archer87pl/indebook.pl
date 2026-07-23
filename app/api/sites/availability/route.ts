// Publiczne API widgetu kalendarza na stronach WWW obiektów: dostępność
// i cena za noc dla typu pokoju w danym miesiącu. Dane i tak są publiczne
// (te same pokazuje wyszukiwarka /o/[slug]/wyniki).

import { NextResponse } from "next/server";
import { conflictingReservationWhere } from "@/lib/availability";
import { addDaysISO, monthDays } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { quoteStay } from "@/lib/pricing";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unitTypeId = Number(searchParams.get("unitTypeId"));
  const month = searchParams.get("month") ?? "";
  if (!Number.isInteger(unitTypeId) || unitTypeId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return NextResponse.json({ error: "Złe parametry" }, { status: 400 });
  }

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    include: {
      seasons: true,
      property: {
        select: { suspended: true, site: { select: { publishedConfig: true } } },
      },
    },
  });
  // dostępność wystawiamy tylko dla obiektów z OPUBLIKOWANĄ stroną WWW —
  // inaczej dane obiektów roboczych/nieopublikowanych byłyby enumerowalne
  if (
    !unitType ||
    unitType.property.suspended ||
    !unitType.property.site?.publishedConfig
  ) {
    return NextResponse.json({ error: "Nie znaleziono" }, { status: 404 });
  }

  const days = monthDays(month);
  const from = days[0];
  const to = addDaysISO(days[days.length - 1], 1);

  const units = await prisma.unit.findMany({
    where: { unitTypeId, active: true },
    select: {
      reservations: {
        where: conflictingReservationWhere(from, to),
        select: { checkIn: true, checkOut: true },
      },
      blocks: {
        where: { startDate: { lt: to }, endDate: { gt: from } },
        select: { startDate: true, endDate: true },
      },
    },
  });

  const result = days.map((date) => {
    const next = addDaysISO(date, 1);
    const free = units.filter(
      (u) =>
        !u.reservations.some((r) => r.checkIn < next && r.checkOut > date) &&
        !u.blocks.some((b) => b.startDate < next && b.endDate > date)
    ).length;
    const priceGr = quoteStay(unitType, date, next, 0).nightly[0].priceGr;
    return { date, free, priceGr };
  });

  return NextResponse.json(
    { days: result },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
