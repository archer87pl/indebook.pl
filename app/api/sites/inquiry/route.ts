// Formularz kontaktowy stron WWW obiektów: zapytanie gościa idzie e-mailem
// do właściciela obiektu. Honeypot „website" odsiewa proste boty (udajemy
// sukces, nic nie wysyłając).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { rateLimit } from "@/lib/rate-limit";

function requestIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Złe żądanie" }, { status: 400 });
  }

  const siteKey = typeof body.siteKey === "string" ? body.siteKey : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body.email === "string" ? body.email.trim().slice(0, 200) : "";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 40) : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const honeypot = typeof body.website === "string" ? body.website : "";

  if (honeypot) return NextResponse.json({ ok: true });

  // anty-spam: maks. 5 zapytań / 10 min na (IP × strona)
  const ok = await rateLimit(`inquiry:${requestIp(request)}:${siteKey}`, 5, 10 * 60_000);
  if (!ok) {
    return NextResponse.json(
      { error: "Zbyt wiele zapytań. Spróbuj ponownie za chwilę." },
      { status: 429 }
    );
  }

  if (!name || !EMAIL_RE.test(email) || message.length < 10 || message.length > 2000) {
    return NextResponse.json(
      { error: "Uzupełnij imię, poprawny e-mail i wiadomość (min. 10 znaków)." },
      { status: 400 }
    );
  }

  const site = await prisma.site.findFirst({
    where: { OR: [{ subdomain: siteKey }, { customDomain: siteKey }] },
    include: { property: { include: { owner: { select: { email: true } } } } },
  });
  if (!site || site.property.suspended) {
    return NextResponse.json({ error: "Nie znaleziono strony" }, { status: 404 });
  }

  await sendMail({
    to: site.property.owner.email,
    subject: `Zapytanie ze strony WWW — ${site.property.name}`,
    heading: "Nowe zapytanie ze strony WWW",
    body: `Gość wysłał zapytanie przez formularz na stronie ${site.property.name}.

Imię i nazwisko: ${name}
E-mail: ${email}${phone ? `\nTelefon: ${phone}` : ""}

Wiadomość:
${message}

Odpowiedz bezpośrednio na adres gościa: ${email}`,
    footer: site.property.name,
  });

  return NextResponse.json({ ok: true });
}
