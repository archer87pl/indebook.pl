import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  // globalny administrator platformy (niezależnie od reszty seedu)
  const admin = await prisma.user.findUnique({
    where: { email: "admin@notelo.pl" },
  });
  if (!admin) {
    await prisma.user.create({
      data: {
        email: "admin@notelo.pl",
        name: "Administrator Notelo",
        passwordHash: hashPassword("admin1234"),
        isAdmin: true,
      },
    });
    console.log("Superadmin: admin@notelo.pl / admin1234");
  }

  const existing = await prisma.property.findFirst();
  if (existing) {
    console.log("Baza już zainicjalizowana — pomijam seed.");
    return;
  }

  const today = new Date();
  const year = today.getFullYear();

  // ---------- Obiekt 1: Willa Notelo ----------
  const willa = await prisma.property.create({
    data: {
      owner: {
        create: {
          email: "demo@notelo.pl",
          name: "Dariusz Demo",
          passwordHash: hashPassword("demo1234"),
        },
      },
      slug: "willa-notelo",
      name: "Willa Notelo",
      plan: "PRO",
      description:
        "Kameralna willa nad jeziorem — 6 pokoi, prywatny pomost i sauna. Rezerwuj bezpośrednio, bez prowizji portali.",
      address: "ul. Nadbrzeżna 12, 11-500 Giżycko",
      checkInFrom: "15:00",
      checkOutTo: "11:00",
      depositPercent: 30,
    },
  });

  const standard = await prisma.unitType.create({
    data: {
      propertyId: willa.id,
      name: "Pokój Standard",
      description: "Przytulny pokój z widokiem na ogród, łóżko małżeńskie, łazienka.",
      maxGuests: 2,
      basePriceGr: 28000,
      minStay: 1,
      units: { create: [{ name: "P1" }, { name: "P2" }, { name: "P3" }] },
    },
  });

  const family = await prisma.unitType.create({
    data: {
      propertyId: willa.id,
      name: "Pokój Rodzinny",
      description: "Dwa pomieszczenia, łóżko małżeńskie + piętrowe, balkon od strony jeziora.",
      maxGuests: 4,
      basePriceGr: 42000,
      minStay: 1,
      units: { create: [{ name: "R1" }, { name: "R2" }] },
    },
  });

  const apartment = await prisma.unitType.create({
    data: {
      propertyId: willa.id,
      name: "Apartament z aneksem",
      description: "50 m², aneks kuchenny, taras, do 6 osób — idealny na dłuższe pobyty.",
      maxGuests: 6,
      basePriceGr: 59000,
      minStay: 2,
      units: { create: [{ name: "A1" }] },
    },
  });

  // Sezon wakacyjny: 1 lipca – 31 sierpnia bieżącego roku
  for (const [ut, priceGr] of [
    [standard, 36000],
    [family, 55000],
    [apartment, 76000],
  ] as const) {
    await prisma.rateSeason.create({
      data: {
        unitTypeId: ut.id,
        name: "Wakacje",
        startDate: `${year}-07-01`,
        endDate: `${year}-08-31`,
        priceGr,
        minStay: 2,
      },
    });
  }

  // Przykładowe rezerwacje w Willi
  const willaUnits = await prisma.unit.findMany({
    where: { unitType: { propertyId: willa.id } },
    orderBy: { id: "asc" },
  });
  await prisma.reservation.create({
    data: {
      code: "HO-DEMO01",
      unitId: willaUnits[0].id,
      checkIn: iso(addDays(today, -1)),
      checkOut: iso(addDays(today, 2)),
      guests: 2,
      guestName: "Anna Kowalska",
      email: "anna.kowalska@example.com",
      phone: "+48 600 100 200",
      totalGr: 108000,
      depositGr: 32400,
      status: "CONFIRMED",
      source: "ONLINE",
    },
  });
  await prisma.reservation.create({
    data: {
      code: "HO-DEMO02",
      unitId: willaUnits[3].id,
      checkIn: iso(addDays(today, 7)),
      checkOut: iso(addDays(today, 12)),
      guests: 4,
      guestName: "Piotr Nowak",
      email: "piotr.nowak@example.com",
      totalGr: 275000,
      depositGr: 82500,
      status: "CONFIRMED",
      source: "MANUAL",
    },
  });
  await prisma.block.create({
    data: {
      unitId: willaUnits[5].id,
      startDate: iso(addDays(today, 3)),
      endDate: iso(addDays(today, 5)),
      note: "Malowanie",
    },
  });

  await prisma.propertyFaq.createMany({
    data: [
      {
        propertyId: willa.id,
        question: "Czy na miejscu jest parking i czy jest płatny?",
        answer: "Tak, bezpłatny parking na zamkniętym terenie obiektu — miejsce dla każdego pokoju.",
      },
      {
        propertyId: willa.id,
        question: "Czy akceptowane są zwierzęta?",
        answer: "Tak, po wcześniejszym zgłoszeniu. Opłata 30 zł/doba.",
      },
      {
        propertyId: willa.id,
        question: "Czy śniadanie jest wliczone w cenę?",
        answer: "Śniadania serwujemy w formie bufetu za dopłatą 35 zł/os. — zaznacz w uwagach do rezerwacji.",
      },
    ],
  });

  // ---------- Obiekt 2: Apartamenty Marina Sopot ----------
  const marina = await prisma.property.create({
    data: {
      owner: {
        create: {
          email: "marina@notelo.pl",
          name: "Marta Marina",
          passwordHash: hashPassword("marina123"),
        },
      },
      slug: "apartamenty-marina-sopot",
      name: "Apartamenty Marina Sopot",
      plan: "STANDARD",
      description:
        "Nowoczesne apartamenty 300 m od plaży i mola. Samodzielne zameldowanie, parking w cenie.",
      address: "ul. Bohaterów Monte Cassino 8, 81-759 Sopot",
      checkInFrom: "16:00",
      checkOutTo: "10:00",
      depositPercent: 25,
    },
  });

  await prisma.unitType.create({
    data: {
      propertyId: marina.id,
      name: "Apartament Standard",
      description: "35 m², sypialnia + salon z aneksem, balkon.",
      maxGuests: 3,
      basePriceGr: 32000,
      minStay: 1,
      units: { create: [{ name: "101" }, { name: "102" }] },
      seasons: {
        create: {
          name: "Wakacje",
          startDate: `${year}-06-20`,
          endDate: `${year}-08-31`,
          priceGr: 45000,
          minStay: 3,
        },
      },
    },
  });

  await prisma.unitType.create({
    data: {
      propertyId: marina.id,
      name: "Apartament Deluxe z widokiem na morze",
      description: "55 m², dwie sypialnie, taras z widokiem na zatokę.",
      maxGuests: 4,
      basePriceGr: 52000,
      minStay: 2,
      units: { create: [{ name: "201" }] },
      seasons: {
        create: {
          name: "Wakacje",
          startDate: `${year}-06-20`,
          endDate: `${year}-08-31`,
          priceGr: 72000,
          minStay: 3,
        },
      },
    },
  });

  console.log("Seed OK:");
  console.log("  demo@notelo.pl / demo1234   → Willa Notelo (/o/willa-notelo)");
  console.log("  marina@notelo.pl / marina123 → Apartamenty Marina Sopot (/o/apartamenty-marina-sopot)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
