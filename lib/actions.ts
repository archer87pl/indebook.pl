"use server";

import { randomBytes, randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { freeUnits, isUnitFree } from "./availability";
import {
  createSession,
  destroySession,
  requireOwner,
  requireSuperadmin,
} from "./auth";
import { hashPassword, verifyPassword } from "./password";
import { isValidISO, todayISO } from "./dates";
import { prisma } from "./db";
import { formatPln, parsePlnToGr } from "./format";
import { syncIcalFeed } from "./ical";
import { appUrl, createP24Payment, p24Configured } from "./payments";
import { amenityDef } from "./amenities";
import {
  canCheckIn,
  checkInUrl,
  DOC_TYPES,
  isValidSignature,
  parseAdditionalGuests,
} from "./checkin";
import { PRICING_RULE_KINDS, quoteStayDynamic } from "./dynamic-pricing";
import {
  INVOICE_KINDS,
  invoiceNumber,
  isValidVatRate,
  splitGross,
} from "./invoices";
import { deletePhotoFile, savePhotoFile } from "./photos";
import {
  canReview,
  displayAuthor,
  isValidRating,
  REVIEW_MAX,
} from "./reviews";
import { planDef } from "./plans";
import { sendMail } from "./mailer";
import { sendSms } from "./sms";
import { slugify, uniquePropertySlug } from "./slug";

const PENDING_TTL_MS = 30 * 60 * 1000; // 30 min na opłacenie zaliczki

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `HO-${s}`;
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Zaznaczone udogodnienia z formularza -> JSON (tylko znane klucze). */
function amenitiesJson(formData: FormData): string {
  const keys = formData
    .getAll("amenities")
    .filter((v): v is string => typeof v === "string" && !!amenityDef(v));
  return JSON.stringify([...new Set(keys)]);
}

// ---------- Konta właścicieli ----------

export async function register(formData: FormData) {
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const propertyName = str(formData, "propertyName");
  const back = `/rejestracja?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&propertyName=${encodeURIComponent(propertyName)}`;
  const fail = (msg: string) => redirect(`${back}&error=${encodeURIComponent(msg)}`);

  if (name.length < 3) fail("Podaj imię i nazwisko.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Podaj poprawny adres e-mail.");
  if (password.length < 8) fail("Hasło musi mieć co najmniej 8 znaków.");
  if (propertyName.length < 3) fail("Podaj nazwę obiektu.");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) fail("Konto z tym adresem e-mail już istnieje — zaloguj się.");

  const slug = await uniquePropertySlug(propertyName);
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash: hashPassword(password),
      property: { create: { name: propertyName, slug } },
    },
  });
  await createSession(user.id);
  redirect("/admin");
}

export async function login(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = str(formData, "password");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !verifyPassword(password, user.passwordHash)) redirect("/login?error=1");
  await createSession(user!.id);
  redirect(user!.isAdmin ? "/superadmin" : "/admin");
}

/** Konto demo: logowanie jednym kliknięciem na wspólne konto pokazowe. */
export async function demoLogin() {
  const user = await prisma.user.findUnique({ where: { email: "demo@rezio.pl" } });
  if (!user) redirect("/login?error=1");
  await createSession(user!.id);
  redirect("/admin");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
      }),
    ]);
    await sendMail({
      to: user.email,
      subject: "Rezio — reset hasła",
      body: `Cześć ${user.name},\n\nAby ustawić nowe hasło, otwórz link (ważny 1 godzinę):\n${appUrl()}/reset-hasla/${token}\n\nJeśli to nie Ty prosiłeś o reset — zignoruj tę wiadomość.`,
    });
  }
  // celowo zawsze sukces — nie zdradzamy, czy konto istnieje
  redirect("/zapomniane-haslo?sent=1");
}

export async function resetPassword(formData: FormData) {
  const token = str(formData, "token");
  const password = str(formData, "password");
  const fail = (msg: string) =>
    redirect(`/reset-hasla/${token}?error=${encodeURIComponent(msg)}`);

  if (password.length < 8) fail("Hasło musi mieć co najmniej 8 znaków.");
  const reset = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!reset || reset.expiresAt <= new Date())
    redirect("/zapomniane-haslo?expired=1");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: reset!.userId },
      data: { passwordHash: hashPassword(password) },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: reset!.userId } }),
    // wylogowanie ze wszystkich urządzeń
    prisma.session.deleteMany({ where: { userId: reset!.userId } }),
  ]);
  redirect("/login?reset=1");
}

// ---------- Rezerwacja gościa ----------

/** Zwraca kod promocyjny, jeśli jest ważny dziś dla danego obiektu. */
async function applicablePromo(propertyId: number, code: string) {
  if (!code) return null;
  const promo = await prisma.promoCode.findUnique({
    where: { propertyId_code: { propertyId, code } },
  });
  if (!promo || !promo.active) return null;
  const today = todayISO();
  if (promo.validFrom && today < promo.validFrom) return null;
  if (promo.validTo && today > promo.validTo) return null;
  if (promo.maxUses > 0 && promo.usedCount >= promo.maxUses) return null;
  return promo;
}

export async function createReservation(formData: FormData) {
  const unitTypeId = Number(str(formData, "unitTypeId"));
  const from = str(formData, "from");
  const to = str(formData, "to");
  const guests = Number(str(formData, "guests"));
  const guestName = str(formData, "guestName");
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  const nip = str(formData, "nip");
  const promoInput = str(formData, "promo").toUpperCase();
  const notes = str(formData, "notes");
  const rodo = str(formData, "rodo");

  const back = `/rezerwuj/${unitTypeId}?from=${from}&to=${to}&guests=${guests}`;
  const fail = (msg: string) => redirect(`${back}&error=${encodeURIComponent(msg)}`);

  if (!Number.isInteger(unitTypeId) || unitTypeId <= 0) redirect("/");
  if (!isValidISO(from) || !isValidISO(to) || to <= from) fail("Nieprawidłowy zakres dat.");
  if (from < todayISO()) fail("Data przyjazdu nie może być w przeszłości.");
  if (!Number.isInteger(guests) || guests < 1) fail("Podaj liczbę gości.");
  if (guestName.length < 3) fail("Podaj imię i nazwisko.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Podaj poprawny adres e-mail.");
  if (rodo !== "on") fail("Wymagana jest zgoda na przetwarzanie danych.");

  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    include: { seasons: true, property: true },
  });
  if (!unitType) redirect("/");
  if (unitType.property.suspended)
    fail("Ten obiekt jest obecnie niedostępny — rezerwacja nie jest możliwa.");
  if (guests > unitType.maxGuests)
    fail(`Ten typ pokoju mieści maksymalnie ${unitType.maxGuests} os.`);

  const quote = await quoteStayDynamic(
    unitType,
    from,
    to,
    unitType.property.depositPercent
  );
  if (quote.nights < quote.minStay)
    fail(`Minimalna długość pobytu w tym terminie to ${quote.minStay} noce.`);

  // kod promocyjny (opcjonalny)
  let discountGr = 0;
  let promoId: number | null = null;
  if (promoInput) {
    const promo = await applicablePromo(unitType.propertyId, promoInput);
    if (!promo) fail("Kod promocyjny jest nieprawidłowy lub wygasł.");
    discountGr = Math.round((quote.totalGr * promo!.percentOff) / 100);
    promoId = promo!.id;
  }
  const totalGr = quote.totalGr - discountGr;
  const depositGr = Math.round((totalGr * unitType.property.depositPercent) / 100);

  let code = "";
  try {
    code = await prisma.$transaction(async (tx) => {
      const units = await freeUnits(unitTypeId, from, to, tx);
      if (units.length === 0) throw new Error("NO_UNITS");
      if (promoId) {
        await tx.promoCode.update({
          where: { id: promoId },
          data: { usedCount: { increment: 1 } },
        });
      }
      const reservation = await tx.reservation.create({
        data: {
          code: newCode(),
          unitId: units[0].id,
          checkIn: from,
          checkOut: to,
          guests,
          guestName,
          email,
          phone,
          nip,
          notes,
          totalGr,
          discountGr,
          promoCode: promoId ? promoInput : "",
          depositGr,
          status: "PENDING",
          source: "ONLINE",
          expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        },
      });
      return reservation.code;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_UNITS")
      fail("Ten termin został właśnie zajęty. Wybierz inne daty.");
    throw e;
  }

  await sendMail({
    to: email,
    subject: `Rezerwacja ${code} — oczekuje na wpłatę zaliczki`,
    body: `Dziękujemy za rezerwację w ${unitType.property.name}. Kwota pobytu: ${formatPln(totalGr)}${discountGr > 0 ? ` (rabat ${formatPln(discountGr)})` : ""}. Zaliczka: ${formatPln(depositGr)}. Rezerwacja: /r/${code}`,
  });
  revalidatePath("/admin");
  redirect(`/r/${code}`);
}

/**
 * Płatność zaliczki: Przelewy24 gdy skonfigurowane (env P24_*),
 * inaczej tryb symulacji (natychmiastowe potwierdzenie).
 */
export async function payDeposit(formData: FormData) {
  const code = str(formData, "code");
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: { unit: { include: { unitType: { include: { property: true } } } } },
  });
  if (!reservation) redirect("/");
  const payable =
    reservation.status === "PENDING" &&
    reservation.expiresAt &&
    reservation.expiresAt > new Date();
  if (!payable) redirect(`/r/${code}`);

  if (p24Configured()) {
    let gatewayUrl = "";
    let errorMsg = "";
    try {
      gatewayUrl = await createP24Payment(
        reservation,
        reservation.unit.unitType.property.name
      );
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : "nieznany błąd";
    }
    if (errorMsg)
      redirect(
        `/r/${code}?error=${encodeURIComponent(`Nie udało się rozpocząć płatności: ${errorMsg}`)}`
      );
    redirect(gatewayUrl);
  }

  // tryb symulacji (dev)
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: "CONFIRMED", expiresAt: null },
  });
  await sendMail({
    to: reservation.email,
    subject: `Rezerwacja ${code} potwierdzona`,
    body: `Zaliczka ${formatPln(reservation.depositGr)} zaksięgowana. Do zobaczenia ${reservation.checkIn}!\n\nWypełnij teraz meldunek online — po wypełnieniu otrzymasz instrukcje przyjazdu:\n${checkInUrl(code)}`,
  });
  if (reservation.phone) {
    await sendSms({
      to: reservation.phone,
      body: `Rezerwacja ${code} w ${reservation.unit.unitType.property.name} potwierdzona. Przyjazd ${reservation.checkIn}. Meldunek online: ${checkInUrl(code)}`,
    });
  }
  revalidatePath(`/r/${code}`);
  redirect(`/r/${code}`);
}

export async function cancelByGuest(formData: FormData) {
  const code = str(formData, "code");
  const reservation = await prisma.reservation.findUnique({ where: { code } });
  if (!reservation) redirect("/");
  if (reservation.status !== "CANCELLED") {
    await prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "CANCELLED" },
    });
    await sendMail({
      to: reservation.email,
      subject: `Rezerwacja ${code} anulowana`,
      body: "Twoja rezerwacja została anulowana.",
    });
  }
  revalidatePath(`/r/${code}`);
  redirect(`/r/${code}`);
}

/** Panel gościa: wyszukanie rezerwacji po kodzie i e-mailu. */
export async function findReservation(formData: FormData) {
  const code = str(formData, "code").toUpperCase();
  const email = str(formData, "email").toLowerCase();
  const reservation = await prisma.reservation.findUnique({ where: { code } });
  if (!reservation || reservation.email.toLowerCase() !== email) {
    redirect(`/moja-rezerwacja?error=1&code=${encodeURIComponent(code)}`);
  }
  redirect(`/r/${reservation.code}`);
}

/** Panel gościa: samodzielna zmiana terminu pobytu. */
export async function changeReservationDates(formData: FormData) {
  const code = str(formData, "code");
  const from = str(formData, "from");
  const to = str(formData, "to");
  const guestsInput = Number(str(formData, "guests"));
  const back = `/r/${code}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      unit: {
        include: { unitType: { include: { seasons: true, property: true } } },
      },
    },
  });
  if (!reservation) redirect("/");
  const r = reservation!;

  const active =
    r.status === "CONFIRMED" ||
    (r.status === "PENDING" && r.expiresAt && r.expiresAt > new Date());
  if (!active) fail("Tej rezerwacji nie można już zmienić.");
  if (r.checkIn <= todayISO())
    fail("Pobyt już się rozpoczął — zmianę terminu uzgodnij z obiektem.");
  if (!isValidISO(from) || !isValidISO(to) || to <= from)
    fail("Nieprawidłowy zakres dat.");
  if (from < todayISO()) fail("Data przyjazdu nie może być w przeszłości.");

  const unitType = r.unit.unitType;
  const guests = guestsInput || r.guests;
  if (guests < 1 || guests > unitType.maxGuests)
    fail(`Ten typ pokoju mieści od 1 do ${unitType.maxGuests} os.`);
  if (from === r.checkIn && to === r.checkOut && guests === r.guests)
    fail("Nic się nie zmieniło — wybrano ten sam termin i liczbę gości.");

  const quote = await quoteStayDynamic(
    unitType,
    from,
    to,
    unitType.property.depositPercent,
    r.id // własna rezerwacja nie podbija sobie obłożenia
  );
  if (quote.nights < quote.minStay)
    fail(`Minimalna długość pobytu w tym terminie to ${quote.minStay} noce.`);

  // zachowaj dotychczasowy rabat proporcjonalnie (np. z kodu promocyjnego)
  const discountRatio =
    r.discountGr > 0 ? r.discountGr / (r.totalGr + r.discountGr) : 0;
  const discountGr = Math.round(quote.totalGr * discountRatio);
  const totalGr = quote.totalGr - discountGr;
  const depositGr = Math.round(
    (totalGr * unitType.property.depositPercent) / 100
  );

  try {
    await prisma.$transaction(async (tx) => {
      const units = await freeUnits(unitType.id, from, to, tx, r.id);
      if (units.length === 0) throw new Error("NO_UNITS");
      // preferuj dotychczasową jednostkę, żeby gość nie zmieniał pokoju bez potrzeby
      const unit = units.find((u) => u.id === r.unitId) ?? units[0];
      await tx.reservation.update({
        where: { id: r.id },
        data: {
          unitId: unit.id,
          checkIn: from,
          checkOut: to,
          guests,
          totalGr,
          discountGr,
          // zaliczka przelicza się tylko, dopóki nie została opłacona
          ...(r.status === "PENDING" ? { depositGr } : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_UNITS")
      fail("Brak wolnych pokoi w nowym terminie. Wybierz inne daty.");
    throw e;
  }

  await sendMail({
    to: r.email,
    subject: `Rezerwacja ${code} — termin zmieniony`,
    body: `Nowy termin pobytu: ${from} → ${to} (${guests} os.). Kwota pobytu: ${formatPln(totalGr)}.`,
  });
  revalidatePath(back);
  redirect(`${back}?changed=1`);
}

/** Panel gościa: meldunek online (karta meldunkowa z e-podpisem). */
export async function submitCheckIn(formData: FormData) {
  const code = str(formData, "code");
  const back = `/r/${code}/meldunek`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      checkInCard: true,
      unit: {
        include: {
          unitType: { include: { property: { include: { owner: true } } } },
        },
      },
    },
  });
  if (!reservation) redirect("/");
  const r = reservation!;
  if (r.checkInCard)
    redirect(`/r/${code}?error=${encodeURIComponent("Meldunek został już wypełniony.")}`);
  if (!canCheckIn(r)) fail("Meldunek online nie jest dostępny dla tej rezerwacji.");

  const fullName = str(formData, "fullName");
  const address = str(formData, "address");
  const citizenship = str(formData, "citizenship");
  const docType = str(formData, "docType");
  const docNumber = str(formData, "docNumber").toUpperCase();
  const carPlate = str(formData, "carPlate").toUpperCase();
  const arrivalTime = str(formData, "arrivalTime");
  const signature = str(formData, "signature");
  const terms = str(formData, "terms");
  const rodo = str(formData, "rodo");

  if (fullName.length < 3) fail("Podaj imię i nazwisko.");
  if (address.length < 5) fail("Podaj adres zamieszkania.");
  if (citizenship.length < 3) fail("Podaj obywatelstwo.");
  if (docType && !DOC_TYPES.some((d) => d.key === docType))
    fail("Wybierz rodzaj dokumentu z listy.");
  if (docNumber && !docType) fail("Wybierz rodzaj dokumentu.");
  if (docNumber && !/^[A-Z0-9 \-]{4,20}$/.test(docNumber))
    fail("Nieprawidłowy numer dokumentu.");
  if (carPlate && !/^[A-Z0-9 \-]{2,12}$/.test(carPlate))
    fail("Nieprawidłowy numer rejestracyjny.");
  if (arrivalTime && !/^\d{2}:\d{2}$/.test(arrivalTime))
    fail("Godzinę przyjazdu podaj w formacie HH:MM.");
  const additional = parseAdditionalGuests(formData, r.guests - 1);
  if (additional.error) fail(additional.error);
  if (terms !== "on") fail("Wymagana jest akceptacja regulaminu obiektu.");
  if (rodo !== "on") fail("Wymagana jest zgoda na przetwarzanie danych.");
  if (!isValidSignature(signature))
    fail("Podpis jest wymagany — złóż podpis w polu formularza.");

  await prisma.$transaction([
    prisma.checkInCard.create({
      data: {
        reservationId: r.id,
        fullName,
        address,
        citizenship,
        docType,
        docNumber,
        carPlate,
        arrivalTime,
        guestsJson: JSON.stringify(additional.guests),
        signaturePng: signature,
        termsAccepted: true,
        rodoAccepted: true,
      },
    }),
    prisma.reservation.update({
      where: { id: r.id },
      // link do meldunku szedł na e-mail rezerwacji — adres jest potwierdzony
      data: { checkInStatus: "COMPLETED", emailVerifiedAt: new Date() },
    }),
  ]);

  const property = r.unit.unitType.property;
  await sendMail({
    to: r.email,
    subject: `Meldunek online przyjęty — rezerwacja ${code}`,
    body: `Dziękujemy, ${fullName}! Karta meldunkowa została wypełniona.${
      property.arrivalInfo
        ? `\n\nInformacje na przyjazd:\n${property.arrivalInfo}`
        : ""
    }\n\nSzczegóły rezerwacji: ${appUrl()}/r/${code}`,
  });
  if (!property.owner.email.endsWith("@rezio.local")) {
    await sendMail({
      to: property.owner.email,
      subject: `Gość wypełnił meldunek online — ${code}`,
      body: `${fullName} wypełnił(a) kartę meldunkową dla rezerwacji ${code} (${r.checkIn} → ${r.checkOut}).\nKarta: ${appUrl()}/admin/rezerwacje/${r.id}/karta`,
    });
  }
  revalidatePath(`/r/${code}`);
  redirect(`/r/${code}?checkedin=1`);
}

// ---------- Opinie gości ----------

/** Panel gościa: wystawienie opinii po pobycie (publiczne po kodzie). */
export async function submitReview(formData: FormData) {
  const code = str(formData, "code");
  const back = `/r/${code}/opinia`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      review: true,
      unit: {
        include: {
          unitType: { include: { property: { include: { owner: true } } } },
        },
      },
    },
  });
  if (!reservation) redirect("/");
  const r = reservation!;
  if (r.review)
    redirect(`/r/${code}?error=${encodeURIComponent("Opinia została już wystawiona. Dziękujemy!")}`);
  if (!canReview({ status: r.status, checkOut: r.checkOut, hasReview: false }))
    fail("Opinię można wystawić dopiero po zakończonym pobycie.");

  const rating = Number(str(formData, "rating"));
  const comment = str(formData, "comment");
  const consent = str(formData, "consent");

  if (!isValidRating(rating)) fail("Wybierz ocenę od 1 do 5 gwiazdek.");
  if (comment.length > REVIEW_MAX)
    fail(`Opinia może mieć maksymalnie ${REVIEW_MAX} znaków.`);
  if (consent !== "on")
    fail("Wymagana jest zgoda na publikację opinii pod imieniem i inicjałem.");

  const property = r.unit.unitType.property;
  await prisma.review.create({
    data: {
      reservationId: r.id,
      propertyId: property.id,
      authorName: displayAuthor(r.guestName),
      rating,
      comment,
    },
  });
  if (!property.owner.email.endsWith("@rezio.local")) {
    await sendMail({
      to: property.owner.email,
      subject: `Nowa opinia (${rating}/5) — rezerwacja ${r.code}`,
      body: `${displayAuthor(r.guestName)} wystawił(a) ocenę ${rating}/5${
        comment ? `:\n\n"${comment}"` : "."
      }\n\nModeruj i odpowiedz: ${appUrl()}/admin/opinie`,
    });
  }
  revalidatePath(`/o/${property.slug}`);
  redirect(`/r/${code}?reviewed=1`);
}

/** Panel obiektu: ukryj/pokaż opinię (moderacja nadużyć). */
export async function toggleReviewHidden(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const review = await prisma.review.findUnique({ where: { id } });
  if (review && review.propertyId === property.id) {
    await prisma.review.update({
      where: { id },
      data: { hidden: !review.hidden },
    });
  }
  revalidatePath("/admin/opinie");
  redirect("/admin/opinie");
}

/** Panel obiektu: publiczna odpowiedź na opinię. */
export async function replyToReview(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const reply = str(formData, "reply").slice(0, REVIEW_MAX);
  const review = await prisma.review.findUnique({ where: { id } });
  if (review && review.propertyId === property.id) {
    await prisma.review.update({ where: { id }, data: { ownerReply: reply } });
  }
  revalidatePath("/admin/opinie");
  redirect("/admin/opinie");
}

// ---------- Czat gość <-> obiekt ----------

const MESSAGE_MAX = 2000;

/** Panel gościa: wiadomość do obiektu (obiekt dostaje powiadomienie e-mail). */
export async function sendGuestMessage(formData: FormData) {
  const code = str(formData, "code");
  const body = str(formData, "body");
  const back = `/r/${code}`;

  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      unit: {
        include: {
          unitType: { include: { property: { include: { owner: true } } } },
        },
      },
    },
  });
  if (!reservation) redirect("/");
  const r = reservation!;
  if (!body || body.length > MESSAGE_MAX)
    redirect(
      `${back}?error=${encodeURIComponent(`Wiadomość musi mieć od 1 do ${MESSAGE_MAX} znaków.`)}#czat`
    );

  await prisma.message.create({
    data: { reservationId: r.id, sender: "GUEST", body },
  });
  const property = r.unit.unitType.property;
  if (!property.owner.email.endsWith("@rezio.local")) {
    await sendMail({
      to: property.owner.email,
      subject: `Nowa wiadomość od gościa — ${r.code}`,
      body: `${r.guestName} (rezerwacja ${r.code}, ${r.checkIn} → ${r.checkOut}) napisał(a):\n\n${body}\n\nOdpowiedz w panelu: ${appUrl()}/admin/rezerwacje/${r.id}#czat`,
    });
  }
  revalidatePath(back);
  redirect(`${back}#czat`);
}

/** Panel obiektu: odpowiedź do gościa (gość dostaje powiadomienie e-mail). */
export async function sendOwnerMessage(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const body = str(formData, "body");
  const back = `/admin/rezerwacje/${id}`;

  const reservation = await ownedReservation(id, property.id);
  if (!reservation) redirect("/admin/rezerwacje");
  const r = reservation!;
  if (!body || body.length > MESSAGE_MAX)
    redirect(
      `${back}?error=${encodeURIComponent(`Wiadomość musi mieć od 1 do ${MESSAGE_MAX} znaków.`)}#czat`
    );

  await prisma.message.create({
    data: { reservationId: r.id, sender: "OWNER", body },
  });
  if (r.email && !r.email.endsWith("@rezio.local")) {
    await sendMail({
      to: r.email,
      subject: `Wiadomość od ${property.name} — rezerwacja ${r.code}`,
      body: `${body}\n\nOdpowiedz na stronie rezerwacji: ${appUrl()}/r/${r.code}#czat`,
    });
  }
  revalidatePath(back);
  redirect(`${back}#czat`);
}

// ---------- Panel obiektu: pomocnicze kontrole własności ----------

async function ownedUnitType(unitTypeId: number, propertyId: number) {
  const unitType = await prisma.unitType.findUnique({
    where: { id: unitTypeId },
    include: { seasons: true, property: true },
  });
  return unitType && unitType.propertyId === propertyId ? unitType : null;
}

async function ownedReservation(id: number, propertyId: number) {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { unit: { include: { unitType: true } } },
  });
  return reservation && reservation.unit.unitType.propertyId === propertyId
    ? reservation
    : null;
}

// ---------- Panel obiektu: rezerwacje ----------

export async function adminSetStatus(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const status = str(formData, "status");
  if (!["PENDING", "CONFIRMED", "CANCELLED"].includes(status)) return;
  const reservation = await ownedReservation(id, property.id);
  if (!reservation) return;
  if (status !== "CANCELLED" && reservation.status === "CANCELLED") {
    // przywrócenie — sprawdź, czy termin nadal wolny
    const free = await isUnitFree(
      reservation.unitId,
      reservation.checkIn,
      reservation.checkOut,
      reservation.id
    );
    if (!free)
      redirect(
        "/admin/rezerwacje?error=" +
          encodeURIComponent("Termin jest już zajęty — nie można przywrócić.")
      );
  }
  await prisma.reservation.update({
    where: { id },
    data: { status, ...(status === "CONFIRMED" ? { expiresAt: null } : {}) },
  });
  if (status === "CONFIRMED" && reservation.status !== "CONFIRMED") {
    if (reservation.email && !reservation.email.endsWith("@rezio.local")) {
      await sendMail({
        to: reservation.email,
        subject: `Rezerwacja ${reservation.code} potwierdzona`,
        body: `Obiekt potwierdził Twoją rezerwację (${reservation.checkIn} → ${reservation.checkOut}).\n\nWypełnij teraz meldunek online — po wypełnieniu otrzymasz instrukcje przyjazdu:\n${checkInUrl(reservation.code)}`,
      });
    }
    if (reservation.phone) {
      await sendSms({
        to: reservation.phone,
        body: `Rezerwacja ${reservation.code} potwierdzona. Przyjazd ${reservation.checkIn}. Meldunek online: ${checkInUrl(reservation.code)}`,
      });
    }
  }
  revalidatePath("/admin/rezerwacje");
  redirect("/admin/rezerwacje");
}

/** Wysyłka (lub ponowienie) linku do meldunku online do gościa. */
export async function adminSendCheckInInvite(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const back = `/admin/rezerwacje/${id}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await ownedReservation(id, property.id);
  if (!reservation) redirect("/admin/rezerwacje");
  const r = reservation!;
  if (!canCheckIn(r))
    fail("Meldunek online jest dostępny tylko dla potwierdzonych rezerwacji przed wymeldowaniem.");
  if (!r.email || r.email.endsWith("@rezio.local"))
    fail("Uzupełnij e-mail gościa, aby wysłać link do meldunku.");

  await sendMail({
    to: r.email,
    subject: `Meldunek online — rezerwacja ${r.code}`,
    body: `${property.name} zaprasza do wypełnienia meldunku online przed przyjazdem (${r.checkIn}).\nZajmie to 2 minuty i przyspieszy zameldowanie na miejscu:\n${checkInUrl(r.code)}`,
  });
  redirect(`${back}?invited=1`);
}

export async function adminCreateReservation(formData: FormData) {
  const { property } = await requireOwner();
  const unitTypeId = Number(str(formData, "unitTypeId"));
  const from = str(formData, "from");
  const to = str(formData, "to");
  const guests = Number(str(formData, "guests")) || 1;
  const guestName = str(formData, "guestName");
  const phone = str(formData, "phone");
  const email = str(formData, "email") || "brak@rezio.local";
  const notes = str(formData, "notes");
  const priceOverride = str(formData, "totalZl");

  const fail = (msg: string) =>
    redirect(`/admin/rezerwacje/nowa?error=${encodeURIComponent(msg)}`);

  if (!isValidISO(from) || !isValidISO(to) || to <= from) fail("Nieprawidłowy zakres dat.");
  if (guestName.length < 3) fail("Podaj imię i nazwisko gościa.");

  const unitType = await ownedUnitType(unitTypeId, property.id);
  if (!unitType) fail("Wybierz typ pokoju.");

  const quote = await quoteStayDynamic(unitType!, from, to, property.depositPercent);
  const totalGr = priceOverride ? parsePlnToGr(priceOverride) : quote.totalGr;
  if (!Number.isFinite(totalGr)) fail("Nieprawidłowa cena.");

  let code = "";
  try {
    code = await prisma.$transaction(async (tx) => {
      const units = await freeUnits(unitTypeId, from, to, tx);
      if (units.length === 0) throw new Error("NO_UNITS");
      const reservation = await tx.reservation.create({
        data: {
          code: newCode(),
          unitId: units[0].id,
          checkIn: from,
          checkOut: to,
          guests,
          guestName,
          email,
          phone,
          notes,
          totalGr,
          depositGr: 0,
          status: "CONFIRMED",
          source: "MANUAL",
        },
      });
      return reservation.code;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_UNITS")
      fail("Brak wolnych jednostek w tym terminie.");
    throw e;
  }
  // rezerwacje telefoniczne/ręczne: od razu zaproś gościa do meldunku online
  if (!email.endsWith("@rezio.local")) {
    await sendMail({
      to: email,
      subject: `Rezerwacja ${code} w ${property.name}`,
      body: `Twoja rezerwacja (${from} → ${to}) została zapisana.\n\nWypełnij meldunek online — po wypełnieniu otrzymasz instrukcje przyjazdu:\n${checkInUrl(code)}\n\nSzczegóły rezerwacji: ${appUrl()}/r/${code}`,
    });
  }
  if (phone) {
    await sendSms({
      to: phone,
      body: `Rezerwacja ${code} w ${property.name} zapisana (${from} - ${to}). Meldunek online: ${checkInUrl(code)}`,
    });
  }
  revalidatePath("/admin/rezerwacje");
  redirect("/admin/rezerwacje");
}

/** Edycja rezerwacji przez właściciela: daty, dane gościa, cena. */
export async function adminUpdateReservation(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const from = str(formData, "from");
  const to = str(formData, "to");
  const guests = Number(str(formData, "guests")) || 1;
  const guestName = str(formData, "guestName");
  const email = str(formData, "email");
  const phone = str(formData, "phone");
  const nip = str(formData, "nip");
  const notes = str(formData, "notes");
  const totalZl = str(formData, "totalZl");

  const back = `/admin/rezerwacje/${id}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await ownedReservation(id, property.id);
  if (!reservation) redirect("/admin/rezerwacje");
  const r = reservation!;

  if (!isValidISO(from) || !isValidISO(to) || to <= from) fail("Nieprawidłowy zakres dat.");
  if (guestName.length < 3) fail("Podaj imię i nazwisko gościa.");
  const totalGr = parsePlnToGr(totalZl);
  if (!Number.isFinite(totalGr)) fail("Nieprawidłowa cena.");

  const datesChanged = from !== r.checkIn || to !== r.checkOut;
  try {
    await prisma.$transaction(async (tx) => {
      let unitId = r.unitId;
      if (datesChanged && r.status !== "CANCELLED") {
        const units = await freeUnits(r.unit.unitTypeId, from, to, tx, r.id);
        if (units.length === 0) throw new Error("NO_UNITS");
        unitId = (units.find((u) => u.id === r.unitId) ?? units[0]).id;
      }
      await tx.reservation.update({
        where: { id: r.id },
        data: {
          unitId,
          checkIn: from,
          checkOut: to,
          guests,
          guestName,
          email,
          phone,
          nip,
          notes,
          totalGr,
        },
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NO_UNITS")
      fail("Brak wolnych jednostek tego typu w nowym terminie.");
    throw e;
  }

  if (datesChanged && email && !email.endsWith("@rezio.local")) {
    await sendMail({
      to: email,
      subject: `Rezerwacja ${r.code} — zmiana terminu`,
      body: `Obiekt zmienił termin Twojej rezerwacji na: ${from} → ${to}. W razie pytań odpowiedz na tę wiadomość.`,
    });
  }
  revalidatePath("/admin/rezerwacje");
  redirect(`${back}?saved=1`);
}

// ---------- Panel obiektu: faktury ----------

/** Wystawia fakturę z rezerwacji (numeracja kolejna per typ+rok+obiekt). */
export async function issueInvoice(formData: FormData) {
  const { property } = await requireOwner();
  const reservationId = Number(str(formData, "reservationId"));
  const kind = str(formData, "kind");
  const vatRate = Number(str(formData, "vatRate"));
  const buyerName = str(formData, "buyerName");
  const buyerNip = str(formData, "buyerNip");
  const buyerAddress = str(formData, "buyerAddress");
  const itemName = str(formData, "itemName");
  const back = `/admin/rezerwacje/${reservationId}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const reservation = await ownedReservation(reservationId, property.id);
  if (!reservation) redirect("/admin/rezerwacje");
  const r = reservation!;

  if (!INVOICE_KINDS.some((k) => k.key === kind)) fail("Wybierz rodzaj faktury.");
  if (!isValidVatRate(vatRate)) fail("Nieprawidłowa stawka VAT.");
  if (buyerName.length < 3) fail("Podaj nazwę / imię i nazwisko nabywcy.");

  const sellerNip = property.sellerNip.trim();
  if (!sellerNip)
    fail(
      "Uzupełnij NIP sprzedawcy w ustawieniach obiektu (sekcja „Dane do faktur”), zanim wystawisz fakturę."
    );

  const grossGr = kind === "ZALICZKOWA" ? r.depositGr : r.totalGr;
  if (grossGr <= 0)
    fail(
      kind === "ZALICZKOWA"
        ? "Ta rezerwacja nie ma zaliczki — wybierz inny rodzaj faktury."
        : "Kwota faktury musi być większa od zera."
    );
  const { netGr, vatGr } = splitGross(grossGr, vatRate);
  const year = Number(todayISO().slice(0, 4));
  const defaultItem = `Usługa noclegowa — ${r.unit.unitType.name}, pobyt ${r.checkIn} → ${r.checkOut}`;

  let invoiceId = 0;
  try {
    invoiceId = await prisma.$transaction(async (tx) => {
      const count = await tx.invoice.count({
        where: { propertyId: property.id, kind, year },
      });
      const seq = count + 1;
      const inv = await tx.invoice.create({
        data: {
          propertyId: property.id,
          reservationId: r.id,
          kind,
          seq,
          year,
          number: invoiceNumber(kind, seq, year),
          issueDate: todayISO(),
          saleDate: r.checkOut,
          sellerName: property.sellerName.trim() || property.name,
          sellerNip,
          sellerAddress: property.sellerAddress.trim() || property.address,
          bankAccount: property.bankAccount,
          buyerName,
          buyerNip,
          buyerAddress,
          itemName: itemName || defaultItem,
          grossGr,
          netGr,
          vatGr,
          vatRate,
        },
      });
      return inv.id;
    });
  } catch {
    fail("Nie udało się wystawić faktury — spróbuj ponownie.");
  }
  revalidatePath(back);
  redirect(`/admin/faktury/${invoiceId}`);
}

export async function deleteInvoice(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const back = str(formData, "back") || "/admin/faktury";
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (invoice && invoice.propertyId === property.id) {
    await prisma.invoice.delete({ where: { id } });
  }
  revalidatePath(back);
  redirect(back);
}

// ---------- Panel obiektu: cennik ----------

export async function adminUpdatePricing(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "unitTypeId"));
  const basePriceGr = parsePlnToGr(str(formData, "basePriceZl"));
  const minStay = Number(str(formData, "minStay")) || 1;
  if (!(await ownedUnitType(id, property.id))) redirect("/admin/cennik");
  if (Number.isFinite(basePriceGr) && basePriceGr > 0) {
    await prisma.unitType.update({
      where: { id },
      data: { basePriceGr, minStay: Math.max(1, minStay) },
    });
  }
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

export async function adminAddSeason(formData: FormData) {
  const { property } = await requireOwner();
  const unitTypeId = Number(str(formData, "unitTypeId"));
  const name = str(formData, "name");
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate");
  const priceGr = parsePlnToGr(str(formData, "priceZl"));
  const minStay = Number(str(formData, "minStay")) || 1;
  const fail = (msg: string) =>
    redirect(`/admin/cennik?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnitType(unitTypeId, property.id))) redirect("/admin/cennik");
  if (!isValidISO(startDate) || !isValidISO(endDate) || endDate < startDate)
    fail("Nieprawidłowy zakres dat sezonu.");
  if (!Number.isFinite(priceGr) || priceGr <= 0) fail("Nieprawidłowa cena sezonu.");
  if (!name) fail("Podaj nazwę sezonu.");

  await prisma.rateSeason.create({
    data: { unitTypeId, name, startDate, endDate, priceGr, minStay: Math.max(1, minStay) },
  });
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

/** Zapis reguły cen dynamicznych (jedna danego rodzaju na obiekt — upsert). */
export async function savePricingRule(formData: FormData) {
  const { property } = await requireOwner();
  const kind = str(formData, "kind");
  const percent = Number(str(formData, "percent"));
  const param = Number(str(formData, "param")) || 0;
  const active = str(formData, "active") === "on";
  const fail = (msg: string) =>
    redirect(`/admin/cennik?error=${encodeURIComponent(msg)}`);

  if (!PRICING_RULE_KINDS.some((k) => k.key === kind)) redirect("/admin/cennik");
  if (!Number.isInteger(percent) || percent < -50 || percent > 100)
    fail("Korekta ceny musi być w zakresie od −50% do +100%.");
  if (kind === "LAST_MINUTE" && (!Number.isInteger(param) || param < 1 || param > 60))
    fail("Last minute: liczba dni do przyjazdu musi być w zakresie 1–60.");
  if (kind === "OCCUPANCY" && (!Number.isInteger(param) || param < 1 || param > 100))
    fail("Próg obłożenia musi być w zakresie 1–100%.");

  await prisma.pricingRule.upsert({
    where: { propertyId_kind: { propertyId: property.id, kind } },
    update: { percent, param, active },
    create: { propertyId: property.id, kind, percent, param, active },
  });
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik?saved=1");
}

export async function adminDeleteSeason(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const season = await prisma.rateSeason.findUnique({
    where: { id },
    include: { unitType: true },
  });
  if (season && season.unitType.propertyId === property.id) {
    await prisma.rateSeason.delete({ where: { id } });
  }
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

// ---------- Panel obiektu: kalendarz / blokady ----------

async function ownedUnit(unitId: number, propertyId: number) {
  const unit = await prisma.unit.findUnique({
    where: { id: unitId },
    include: { unitType: true },
  });
  return unit && unit.unitType.propertyId === propertyId ? unit : null;
}

export async function adminAddBlock(formData: FormData) {
  const { property } = await requireOwner();
  const unitId = Number(str(formData, "unitId"));
  const startDate = str(formData, "startDate");
  const endDate = str(formData, "endDate");
  const note = str(formData, "note");
  const fail = (msg: string) =>
    redirect(`/admin/kalendarz?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnit(unitId, property.id))) redirect("/admin/kalendarz");
  if (!isValidISO(startDate) || !isValidISO(endDate) || endDate <= startDate)
    fail("Nieprawidłowy zakres blokady (koniec musi być po początku).");
  await prisma.block.create({ data: { unitId, startDate, endDate, note } });
  revalidatePath("/admin/kalendarz");
  redirect("/admin/kalendarz");
}

export async function adminDeleteBlock(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const block = await prisma.block.findUnique({
    where: { id },
    include: { unit: { include: { unitType: true } } },
  });
  if (block && block.unit.unitType.propertyId === property.id) {
    await prisma.block.delete({ where: { id } });
  }
  revalidatePath("/admin/kalendarz");
  redirect("/admin/kalendarz");
}

// ---------- Panel obiektu: kanały (import iCal) ----------

const CHANNEL_KEYS = ["BOOKING", "AIRBNB", "VRBO", "OTHER"];

export async function addIcalFeed(formData: FormData) {
  const { property } = await requireOwner();
  const unitId = Number(str(formData, "unitId"));
  const url = str(formData, "url");
  const name = str(formData, "name");
  const channel = str(formData, "channel");
  const fail = (msg: string) =>
    redirect(`/admin/kanaly?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnit(unitId, property.id))) redirect("/admin/kanaly");
  if (!/^https?:\/\/.+/i.test(url)) fail("Podaj poprawny adres URL kalendarza iCal.");
  if (!CHANNEL_KEYS.includes(channel)) fail("Wybierz kanał.");

  const feed = await prisma.icalFeed.create({
    data: { unitId, url, name, channel },
  });
  const result = await syncIcalFeed(feed);
  revalidatePath("/admin/kanaly");
  if (!result.ok)
    redirect(
      `/admin/kanaly?error=${encodeURIComponent(`Kalendarz dodany, ale synchronizacja nie powiodła się: ${result.error}`)}`
    );
  redirect(`/admin/kanaly?synced=${result.imported}`);
}

export async function deleteIcalFeed(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const feed = await prisma.icalFeed.findUnique({
    where: { id },
    include: { unit: { include: { unitType: true } } },
  });
  if (feed && feed.unit.unitType.propertyId === property.id) {
    await prisma.$transaction([
      prisma.block.deleteMany({ where: { feedId: id } }),
      prisma.icalFeed.delete({ where: { id } }),
    ]);
  }
  revalidatePath("/admin/kanaly");
  redirect("/admin/kanaly");
}

export async function syncOneIcalFeed(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const feed = await prisma.icalFeed.findUnique({
    where: { id },
    include: { unit: { include: { unitType: true } } },
  });
  if (!feed || feed.unit.unitType.propertyId !== property.id)
    redirect("/admin/kanaly");
  const result = await syncIcalFeed(feed!);
  revalidatePath("/admin/kanaly");
  if (!result.ok)
    redirect(
      `/admin/kanaly?error=${encodeURIComponent(`${feed!.name || feed!.url}: ${result.error}`)}`
    );
  redirect(`/admin/kanaly?synced=${result.imported}`);
}

export async function syncAllIcalFeeds() {
  const { property } = await requireOwner();
  const feeds = await prisma.icalFeed.findMany({
    where: { unit: { unitType: { propertyId: property.id } } },
  });
  let imported = 0;
  const errors: string[] = [];
  for (const feed of feeds) {
    const result = await syncIcalFeed(feed);
    if (result.ok) imported += result.imported;
    else errors.push(`${feed.name || feed.url}: ${result.error}`);
  }
  revalidatePath("/admin/kanaly");
  if (errors.length > 0)
    redirect(`/admin/kanaly?error=${encodeURIComponent(errors.join(" · "))}`);
  redirect(`/admin/kanaly?synced=${imported}`);
}

// ---------- Panel obiektu: dane obiektu ----------

export async function updateProperty(formData: FormData) {
  const { property } = await requireOwner();
  const name = str(formData, "name");
  const description = str(formData, "description");
  const address = str(formData, "address");
  const checkInFrom = str(formData, "checkInFrom");
  const checkOutTo = str(formData, "checkOutTo");
  const depositPercent = Number(str(formData, "depositPercent"));
  const terms = str(formData, "terms");
  const privacyPolicy = str(formData, "privacyPolicy");
  const arrivalInfo = str(formData, "arrivalInfo");
  const sellerName = str(formData, "sellerName");
  const sellerNip = str(formData, "sellerNip");
  const sellerAddress = str(formData, "sellerAddress");
  const bankAccount = str(formData, "bankAccount");
  const fail = (msg: string) =>
    redirect(`/admin/obiekt?error=${encodeURIComponent(msg)}`);

  if (name.length < 3) fail("Nazwa obiektu jest za krótka.");
  if (!/^\d{2}:\d{2}$/.test(checkInFrom) || !/^\d{2}:\d{2}$/.test(checkOutTo))
    fail("Godziny podaj w formacie HH:MM.");
  if (!Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100)
    fail("Zaliczka musi być w zakresie 0–100%.");

  await prisma.property.update({
    where: { id: property.id },
    data: {
      name,
      description,
      address,
      checkInFrom,
      checkOutTo,
      depositPercent,
      terms,
      privacyPolicy,
      arrivalInfo,
      sellerName,
      sellerNip,
      sellerAddress,
      bankAccount,
    },
  });
  revalidatePath("/admin/obiekt");
  redirect("/admin/obiekt?saved=1");
}

// ---------- Panel obiektu: plan (upgrade/downgrade) ----------

export async function ownerSetPlan(formData: FormData) {
  const { property } = await requireOwner();
  const planKey = str(formData, "plan");
  const fail = (msg: string) =>
    redirect(`/admin/plan?error=${encodeURIComponent(msg)}`);

  if (!["FREE", "STANDARD", "PRO"].includes(planKey)) fail("Nieznany plan.");
  if (planKey === property.plan) redirect("/admin/plan");

  const target = planDef(planKey);
  if (target.maxUnits !== null) {
    const units = await prisma.unit.count({
      where: { unitType: { propertyId: property.id } },
    });
    if (units > target.maxUnits)
      fail(
        `Masz ${units} jednostek, a plan ${target.label} pozwala na maks. ${target.maxUnits}. Usuń nadmiarowe jednostki, zanim obniżysz plan.`
      );
  }

  await prisma.property.update({
    where: { id: property.id },
    data: { plan: planKey },
  });
  revalidatePath("/admin/plan");
  redirect("/admin/plan?saved=1");
}

// ---------- Panel obiektu: FAQ ----------

export async function addPropertyFaq(formData: FormData) {
  const { property } = await requireOwner();
  const question = str(formData, "question");
  const answer = str(formData, "answer");
  const fail = (msg: string) =>
    redirect(`/admin/obiekt?error=${encodeURIComponent(msg)}`);

  if (question.length < 5) fail("Pytanie jest za krótkie.");
  if (answer.length < 2) fail("Dopisz odpowiedź na pytanie.");

  await prisma.propertyFaq.create({
    data: { propertyId: property.id, question, answer },
  });
  revalidatePath("/admin/obiekt");
  redirect("/admin/obiekt?saved=1");
}

export async function updatePropertyFaq(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const question = str(formData, "question");
  const answer = str(formData, "answer");
  const fail = (msg: string) =>
    redirect(`/admin/obiekt?error=${encodeURIComponent(msg)}`);

  const faq = await prisma.propertyFaq.findUnique({ where: { id } });
  if (!faq || faq.propertyId !== property.id) redirect("/admin/obiekt");
  if (question.length < 5) fail("Pytanie jest za krótkie.");
  if (answer.length < 2) fail("Dopisz odpowiedź na pytanie.");

  await prisma.propertyFaq.update({ where: { id }, data: { question, answer } });
  revalidatePath("/admin/obiekt");
  redirect("/admin/obiekt?saved=1");
}

export async function deletePropertyFaq(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const faq = await prisma.propertyFaq.findUnique({ where: { id } });
  if (faq && faq.propertyId === property.id) {
    await prisma.propertyFaq.delete({ where: { id } });
  }
  revalidatePath("/admin/obiekt");
  redirect("/admin/obiekt");
}

// ---------- Panel obiektu: zdjęcia ----------

export async function uploadPropertyPhoto(formData: FormData) {
  const { property } = await requireOwner();
  const file = formData.get("file");
  const fail = (msg: string) =>
    redirect(`/admin/obiekt?error=${encodeURIComponent(msg)}`);
  if (!(file instanceof File)) fail("Wybierz plik ze zdjęciem.");
  let path = "";
  try {
    path = await savePhotoFile(file as File, `p${property.id}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Błąd zapisu pliku.");
  }
  await prisma.photo.create({ data: { propertyId: property.id, path } });
  revalidatePath("/admin/obiekt");
  redirect("/admin/obiekt?saved=1");
}

export async function uploadUnitTypePhoto(formData: FormData) {
  const { property } = await requireOwner();
  const unitTypeId = Number(str(formData, "unitTypeId"));
  const file = formData.get("file");
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);
  if (!(await ownedUnitType(unitTypeId, property.id))) redirect("/admin/pokoje");
  if (!(file instanceof File)) fail("Wybierz plik ze zdjęciem.");
  let path = "";
  try {
    path = await savePhotoFile(file as File, `p${property.id}`);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Błąd zapisu pliku.");
  }
  await prisma.photo.create({ data: { unitTypeId, path } });
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

export async function deletePhoto(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const back = str(formData, "back") === "pokoje" ? "/admin/pokoje" : "/admin/obiekt";
  const photo = await prisma.photo.findUnique({
    where: { id },
    include: { unitType: true },
  });
  const owned =
    photo &&
    (photo.propertyId === property.id ||
      photo.unitType?.propertyId === property.id);
  if (owned) {
    await deletePhotoFile(photo!.path);
    await prisma.photo.delete({ where: { id } });
  }
  revalidatePath(back);
  redirect(back);
}

// ---------- Panel obiektu: kody promocyjne ----------

export async function createPromoCode(formData: FormData) {
  const { property } = await requireOwner();
  const code = str(formData, "code").toUpperCase();
  const percentOff = Number(str(formData, "percentOff"));
  const validFrom = str(formData, "validFrom");
  const validTo = str(formData, "validTo");
  const maxUses = Number(str(formData, "maxUses")) || 0;
  const fail = (msg: string) =>
    redirect(`/admin/cennik?error=${encodeURIComponent(msg)}`);

  if (!/^[A-Z0-9-]{3,24}$/.test(code))
    fail("Kod: 3–24 znaki (litery, cyfry, myślnik).");
  if (!Number.isInteger(percentOff) || percentOff < 1 || percentOff > 90)
    fail("Rabat musi być w zakresie 1–90%.");
  if (validFrom && !isValidISO(validFrom)) fail("Nieprawidłowa data początku.");
  if (validTo && !isValidISO(validTo)) fail("Nieprawidłowa data końca.");

  const existing = await prisma.promoCode.findUnique({
    where: { propertyId_code: { propertyId: property.id, code } },
  });
  if (existing) fail(`Kod ${code} już istnieje.`);

  await prisma.promoCode.create({
    data: { propertyId: property.id, code, percentOff, validFrom, validTo, maxUses },
  });
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

export async function togglePromoCode(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (promo && promo.propertyId === property.id) {
    await prisma.promoCode.update({
      where: { id },
      data: { active: !promo.active },
    });
  }
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

export async function deletePromoCode(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const promo = await prisma.promoCode.findUnique({ where: { id } });
  if (promo && promo.propertyId === property.id) {
    await prisma.promoCode.delete({ where: { id } });
  }
  revalidatePath("/admin/cennik");
  redirect("/admin/cennik");
}

// ---------- Panel obiektu: pokoje (typy i jednostki) ----------

export async function toggleUnitActive(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const unit = await ownedUnit(id, property.id);
  if (unit) {
    await prisma.unit.update({ where: { id }, data: { active: !unit.active } });
  }
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

export async function createUnitType(formData: FormData) {
  const { property } = await requireOwner();
  const name = str(formData, "name");
  const description = str(formData, "description");
  const maxGuests = Number(str(formData, "maxGuests"));
  const basePriceGr = parsePlnToGr(str(formData, "basePriceZl"));
  const minStay = Number(str(formData, "minStay")) || 1;
  const unitsCount = Number(str(formData, "unitsCount"));
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);

  if (name.length < 2) fail("Podaj nazwę typu pokoju.");
  if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 30)
    fail("Nieprawidłowa maksymalna liczba gości.");
  if (!Number.isFinite(basePriceGr) || basePriceGr <= 0)
    fail("Nieprawidłowa cena bazowa.");
  if (!Number.isInteger(unitsCount) || unitsCount < 1 || unitsCount > 50)
    fail("Liczba jednostek musi być między 1 a 50.");

  const plan = planDef(property.plan);
  if (plan.maxUnits !== null) {
    const current = await prisma.unit.count({
      where: { unitType: { propertyId: property.id } },
    });
    if (current + unitsCount > plan.maxUnits)
      fail(
        `Plan ${plan.label} pozwala na maks. ${plan.maxUnits} jednostek (masz ${current}). Przejdź na wyższy plan, aby dodać więcej.`
      );
  }

  await prisma.unitType.create({
    data: {
      propertyId: property.id,
      name,
      description,
      maxGuests,
      basePriceGr,
      minStay: Math.max(1, minStay),
      amenities: amenitiesJson(formData),
      units: {
        create: Array.from({ length: unitsCount }, (_, i) => ({
          name: `${i + 1}`,
          icalToken: randomBytes(12).toString("hex"),
        })),
      },
    },
  });
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

export async function updateUnitType(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  const description = str(formData, "description");
  const maxGuests = Number(str(formData, "maxGuests"));
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnitType(id, property.id))) redirect("/admin/pokoje");
  if (name.length < 2) fail("Podaj nazwę typu pokoju.");
  if (!Number.isInteger(maxGuests) || maxGuests < 1 || maxGuests > 30)
    fail("Nieprawidłowa maksymalna liczba gości.");

  await prisma.unitType.update({
    where: { id },
    data: { name, description, maxGuests, amenities: amenitiesJson(formData) },
  });
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

export async function deleteUnitType(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnitType(id, property.id))) redirect("/admin/pokoje");
  const reservations = await prisma.reservation.count({
    where: { unit: { unitTypeId: id } },
  });
  if (reservations > 0)
    fail(
      "Nie można usunąć typu pokoju, który ma rezerwacje (także historyczne) — zostają jako historia rozliczeń. Możesz usunąć wolne jednostki, żeby wyłączyć go ze sprzedaży."
    );

  await prisma.$transaction([
    prisma.block.deleteMany({ where: { unit: { unitTypeId: id } } }),
    prisma.rateSeason.deleteMany({ where: { unitTypeId: id } }),
    prisma.unit.deleteMany({ where: { unitTypeId: id } }),
    prisma.unitType.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

export async function addUnit(formData: FormData) {
  const { property } = await requireOwner();
  const unitTypeId = Number(str(formData, "unitTypeId"));
  const name = str(formData, "name");
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnitType(unitTypeId, property.id))) redirect("/admin/pokoje");
  if (!name) fail("Podaj nazwę/numer jednostki.");
  const plan = planDef(property.plan);
  if (plan.maxUnits !== null) {
    const current = await prisma.unit.count({
      where: { unitType: { propertyId: property.id } },
    });
    if (current + 1 > plan.maxUnits)
      fail(
        `Plan ${plan.label} pozwala na maks. ${plan.maxUnits} jednostek. Przejdź na wyższy plan, aby dodać więcej.`
      );
  }
  await prisma.unit.create({
    data: { unitTypeId, name, icalToken: randomBytes(12).toString("hex") },
  });
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}

// ---------- Superadmin ----------

export async function superSetPlan(formData: FormData) {
  await requireSuperadmin();
  const propertyId = Number(str(formData, "propertyId"));
  const plan = str(formData, "plan");
  if (["FREE", "STANDARD", "PRO"].includes(plan)) {
    await prisma.property.update({ where: { id: propertyId }, data: { plan } });
  }
  revalidatePath("/superadmin");
  redirect("/superadmin");
}

/** Edycja danych obiektu przez administratora platformy. */
export async function superUpdateProperty(formData: FormData) {
  await requireSuperadmin();
  const id = Number(str(formData, "id"));
  const name = str(formData, "name");
  const slug = slugify(str(formData, "slug"));
  const plan = str(formData, "plan");
  const depositPercent = Number(str(formData, "depositPercent"));
  const checkInFrom = str(formData, "checkInFrom");
  const checkOutTo = str(formData, "checkOutTo");
  const address = str(formData, "address");
  const description = str(formData, "description");
  const back = `/superadmin/obiekt/${id}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) redirect("/superadmin");
  if (name.length < 3) fail("Nazwa obiektu jest za krótka.");
  if (!slug) fail("Nieprawidłowy adres (slug).");
  if (!["FREE", "STANDARD", "PRO"].includes(plan)) fail("Nieznany plan.");
  if (!/^\d{2}:\d{2}$/.test(checkInFrom) || !/^\d{2}:\d{2}$/.test(checkOutTo))
    fail("Godziny podaj w formacie HH:MM.");
  if (!Number.isInteger(depositPercent) || depositPercent < 0 || depositPercent > 100)
    fail("Zaliczka musi być w zakresie 0–100%.");

  const slugTaken = await prisma.property.findUnique({ where: { slug } });
  if (slugTaken && slugTaken.id !== id)
    fail(`Adres /o/${slug} jest już zajęty przez inny obiekt.`);

  await prisma.property.update({
    where: { id },
    data: { name, slug, plan, depositPercent, checkInFrom, checkOutTo, address, description },
  });
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}

/** Zawieszenie / przywrócenie obiektu (ukrycie z katalogu, blokada rezerwacji). */
export async function superToggleSuspend(formData: FormData) {
  await requireSuperadmin();
  const id = Number(str(formData, "id"));
  const property = await prisma.property.findUnique({ where: { id } });
  if (property) {
    await prisma.property.update({
      where: { id },
      data: { suspended: !property.suspended },
    });
  }
  revalidatePath(`/superadmin/obiekt/${id}`);
  revalidatePath("/superadmin");
  redirect(`/superadmin/obiekt/${id}`);
}

/** Edycja konta właściciela (imię, e-mail) przez administratora platformy. */
export async function superUpdateOwner(formData: FormData) {
  await requireSuperadmin();
  const propertyId = Number(str(formData, "propertyId"));
  const userId = Number(str(formData, "userId"));
  const name = str(formData, "name");
  const email = str(formData, "email").toLowerCase();
  const back = `/superadmin/obiekt/${propertyId}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  if (name.length < 3) fail("Podaj imię i nazwisko właściciela.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Podaj poprawny adres e-mail.");
  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== userId) fail("Inne konto już używa tego adresu e-mail.");

  await prisma.user.update({ where: { id: userId }, data: { name, email } });
  revalidatePath(back);
  redirect(`${back}?saved=1`);
}

/** Wysyła właścicielowi link do ustawienia nowego hasła. */
export async function superSendPasswordReset(formData: FormData) {
  await requireSuperadmin();
  const propertyId = Number(str(formData, "propertyId"));
  const userId = Number(str(formData, "userId"));
  const back = `/superadmin/obiekt/${propertyId}`;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + 3600_000) },
      }),
    ]);
    await sendMail({
      to: user.email,
      subject: "Rezio — reset hasła",
      body: `Cześć ${user.name},\n\nAdministrator platformy zainicjował reset hasła. Ustaw nowe hasło (link ważny 1 godzinę):\n${appUrl()}/reset-hasla/${token}`,
    });
  }
  redirect(`${back}?reset=1`);
}

/**
 * Trwałe usunięcie obiektu wraz z całą jego historią i kontem właściciela.
 * Wymaga wpisania sluga obiektu jako potwierdzenia.
 */
export async function superDeleteProperty(formData: FormData) {
  await requireSuperadmin();
  const id = Number(str(formData, "id"));
  const confirmSlug = str(formData, "confirmSlug");
  const back = `/superadmin/obiekt/${id}`;
  const fail = (msg: string) => redirect(`${back}?error=${encodeURIComponent(msg)}`);

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property) redirect("/superadmin");
  if (confirmSlug !== property.slug)
    fail("Aby usunąć obiekt, wpisz dokładnie jego adres (slug) w polu potwierdzenia.");

  // ścieżki zdjęć do sprzątnięcia w Blob po udanej transakcji
  const photos = await prisma.photo.findMany({
    where: { OR: [{ propertyId: id }, { unitType: { propertyId: id } }] },
    select: { path: true },
  });

  const inProperty = { unit: { unitType: { propertyId: id } } };
  await prisma.$transaction([
    prisma.invoice.deleteMany({ where: { propertyId: id } }),
    prisma.review.deleteMany({ where: { propertyId: id } }),
    prisma.message.deleteMany({ where: { reservation: inProperty } }),
    prisma.checkInCard.deleteMany({ where: { reservation: inProperty } }),
    prisma.reservation.deleteMany({ where: inProperty }),
    prisma.block.deleteMany({ where: { unit: { unitType: { propertyId: id } } } }),
    prisma.icalFeed.deleteMany({ where: { unit: { unitType: { propertyId: id } } } }),
    prisma.photo.deleteMany({
      where: { OR: [{ propertyId: id }, { unitType: { propertyId: id } }] },
    }),
    prisma.unit.deleteMany({ where: { unitType: { propertyId: id } } }),
    prisma.rateSeason.deleteMany({ where: { unitType: { propertyId: id } } }),
    prisma.promoCode.deleteMany({ where: { propertyId: id } }),
    prisma.propertyFaq.deleteMany({ where: { propertyId: id } }),
    prisma.pricingRule.deleteMany({ where: { propertyId: id } }),
    prisma.unitType.deleteMany({ where: { propertyId: id } }),
    prisma.property.delete({ where: { id } }),
    prisma.session.deleteMany({ where: { userId: property!.ownerId } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: property!.ownerId } }),
    prisma.user.delete({ where: { id: property!.ownerId } }),
  ]);

  // best-effort: pliki w Blob (nie blokujemy usunięcia, gdy się nie powiedzie)
  for (const p of photos) {
    try {
      await deletePhotoFile(p.path);
    } catch {
      // pominięcie osieroconego pliku jest akceptowalne
    }
  }
  revalidatePath("/superadmin");
  redirect("/superadmin?deleted=1");
}

export async function deleteUnit(formData: FormData) {
  const { property } = await requireOwner();
  const id = Number(str(formData, "id"));
  const fail = (msg: string) =>
    redirect(`/admin/pokoje?error=${encodeURIComponent(msg)}`);

  if (!(await ownedUnit(id, property.id))) redirect("/admin/pokoje");
  const reservations = await prisma.reservation.count({ where: { unitId: id } });
  if (reservations > 0)
    fail("Nie można usunąć jednostki, która ma rezerwacje (także historyczne).");
  await prisma.$transaction([
    prisma.block.deleteMany({ where: { unitId: id } }),
    prisma.unit.delete({ where: { id } }),
  ]);
  revalidatePath("/admin/pokoje");
  redirect("/admin/pokoje");
}
