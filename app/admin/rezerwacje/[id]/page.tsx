import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Check,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Plus,
  Send,
} from "lucide-react";
import ChatThread from "@/components/ChatThread";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SubmitButton from "@/components/ui/SubmitButton";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import {
  adminSendCheckInInvite,
  adminUpdateReservation,
  issueInvoice,
  sendOwnerMessage,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { canCheckIn, docTypeLabel, maskDocNumber } from "@/lib/checkin";
import { formatDateShortPl, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { INVOICE_KINDS, VAT_RATES } from "@/lib/invoices";

export const dynamic = "force-dynamic";

function dayShortPl(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Krok osi statusu wg 2c: kółko ✓ / numer, etykieta i data pod spodem. */
function Step({
  state,
  n,
  label,
  sub,
}: {
  state: "done" | "active" | "todo";
  n: number;
  label: string;
  sub?: string;
}) {
  return (
    <div className="flex-1 text-center">
      {state === "done" ? (
        <span className="mx-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-600 text-white">
          <Check size={15} strokeWidth={2.5} />
        </span>
      ) : state === "active" ? (
        <span className="mx-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-900 text-[13px] font-bold text-white shadow-[0_0_0_4px_#e6f3ec]">
          {n}
        </span>
      ) : (
        <span className="mx-auto flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-dashed border-[#b7cabf] bg-white text-[13px] font-bold text-slate-400">
          {n}
        </span>
      )}
      <div
        className={`mt-1.5 text-[11px] font-bold ${state === "todo" ? "text-slate-500" : ""}`}
      >
        {label}
      </div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function StepLine({ done }: { done: boolean }) {
  return <div className={`mb-[26px] h-0.5 flex-1 ${done ? "bg-brand-600" : "bg-brand-200/60"}`} />;
}

export default async function EditReservationPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { property } = await requireOwner();
  const { id } = await props.params;

  const reservation = await prisma.reservation.findUnique({
    where: { id: Number(id) },
    include: {
      unit: { include: { unitType: { include: { photos: { take: 1 } } } } },
      checkInCard: true,
    },
  });
  if (!reservation || reservation.unit.unitType.propertyId !== property.id) notFound();
  const card = reservation.checkInCard;
  const r = reservation;

  // otwarcie rezerwacji = przeczytanie wiadomości gościa
  await prisma.message.updateMany({
    where: { reservationId: r.id, sender: "GUEST", readAt: null },
    data: { readAt: new Date() },
  });
  const [messages, invoices, pastStays] = await prisma.$transaction([
    prisma.message.findMany({
      where: { reservationId: r.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invoice.findMany({
      where: { reservationId: r.id },
      orderBy: { id: "desc" },
    }),
    prisma.reservation.count({
      where: {
        unit: { unitType: { propertyId: property.id } },
        email: r.email,
        status: "CONFIRMED",
        NOT: { id: r.id },
      },
    }),
  ]);

  const today = todayISO();
  const nights = nightsBetween(r.checkIn, r.checkOut);
  const grossGr = r.totalGr + r.discountGr;
  const perNight = nights > 0 ? Math.round(grossGr / nights) : grossGr;
  const paidGr = r.status === "CONFIRMED" && r.paymentOrderId ? r.depositGr : 0;
  const photo = r.unit.unitType.photos[0];
  const cancelled = r.status === "CANCELLED";
  const input = "input w-full";

  const paymentState: "done" | "active" | "todo" =
    r.status === "CONFIRMED" ? "done" : cancelled ? "todo" : "active";
  const checkinState: "done" | "active" | "todo" =
    r.checkInStatus === "COMPLETED"
      ? "done"
      : r.status === "CONFIRMED" && canCheckIn(r)
        ? "active"
        : "todo";
  const arrivalState: "done" | "active" | "todo" =
    r.status === "CONFIRMED" && today >= r.checkIn
      ? today >= r.checkOut
        ? "done"
        : "active"
      : "todo";
  const departureState: "done" | "active" | "todo" =
    r.status === "CONFIRMED" && today >= r.checkOut ? "done" : "todo";

  return (
    <div className="space-y-4">
      {/* Nagłówek rezerwacji */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/rezerwacje"
          className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[9px] border border-slate-200 bg-white text-slate-600 transition-colors hover:border-brand-600 hover:text-brand-700"
          aria-label="Wróć do listy rezerwacji"
        >
          <ArrowLeft size={16} strokeWidth={2} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base font-bold tracking-[-0.01em]">{r.guestName}</h1>
            <span className="tnum rounded-md bg-brand-100 px-2 py-0.5 text-[11.5px] text-brand-600">
              {r.code}
            </span>
            {r.status === "CONFIRMED" ? (
              <Badge tone="success">Potwierdzona</Badge>
            ) : r.status === "PENDING" ? (
              <Badge tone="warning">Oczekuje na wpłatę</Badge>
            ) : (
              <Badge tone="danger">Anulowana</Badge>
            )}
          </div>
          <p className="text-[11.5px] text-slate-500">
            Utworzona {formatDateShortPl(r.createdAt.toISOString().slice(0, 10))} · kanał{" "}
            {r.source === "MANUAL" ? "ręczny" : "bezpośredni"}
            {r.paymentOrderId && ` · płatność P24 #${r.paymentOrderId}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="quiet" href="#faktury">
            <FileText size={14} strokeWidth={2} /> Faktura
          </Button>
          {card ? (
            <Button href={`/admin/rezerwacje/${r.id}/karta`}>
              <Check size={14} strokeWidth={2.4} /> Karta meldunkowa
            </Button>
          ) : (
            <Button href={`/r/${r.code}`}>Strona gościa →</Button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1fr_320px]">
        {/* KOLUMNA GŁÓWNA */}
        <div className="min-w-0 space-y-4">
          {/* Oś statusu */}
          <Card className="px-4 py-4">
            <div className="flex items-center">
              <Step
                state="done"
                n={1}
                label="Rezerwacja"
                sub={dayShortPl(r.createdAt.toISOString().slice(0, 10))}
              />
              <StepLine done={paymentState === "done"} />
              <Step
                state={paymentState}
                n={2}
                label="Płatność"
                sub={
                  r.status === "CONFIRMED"
                    ? r.paymentOrderId
                      ? "online ✓"
                      : "potwierdzona"
                    : cancelled
                      ? "—"
                      : "oczekuje"
                }
              />
              <StepLine done={checkinState === "done"} />
              <Step
                state={checkinState}
                n={3}
                label="Meldunek online"
                sub={
                  card
                    ? dayShortPl(card.completedAt.toISOString().slice(0, 10))
                    : checkinState === "active"
                      ? "czeka na gościa"
                      : "—"
                }
              />
              <StepLine done={arrivalState !== "todo"} />
              <Step
                state={arrivalState}
                n={4}
                label="Przyjazd"
                sub={`${dayShortPl(r.checkIn)} ${property.checkInFrom}`}
              />
              <StepLine done={departureState === "done"} />
              <Step
                state={departureState}
                n={5}
                label="Wyjazd"
                sub={`${dayShortPl(r.checkOut)} ${property.checkOutTo}`}
              />
            </div>
          </Card>

          {/* Pobyt + cena */}
          <Card>
            <CardHeader title="Pobyt" />
            <div className="flex flex-wrap gap-4 px-[18px] pt-4">
              <div
                className="flex h-[100px] w-[150px] flex-none items-center justify-center overflow-hidden rounded-[11px] bg-slate-100 text-center text-[10px] text-slate-400"
                style={
                  photo
                    ? undefined
                    : {
                        background:
                          "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 8px,#e6ede9 8px,#e6ede9 16px)",
                      }
                }
              >
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.path}
                    alt={r.unit.unitType.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="tnum">zdjęcie pokoju</span>
                )}
              </div>
              <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-3.5">
                <div>
                  <div className="th">Jednostka</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold">
                    {r.unit.unitType.name} ({r.unit.name})
                  </div>
                </div>
                <div>
                  <div className="th">Goście</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold">{r.guests} os.</div>
                </div>
                <div>
                  <div className="th">Przyjazd</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold">
                    {dayShortPl(r.checkIn)} · od {property.checkInFrom}
                  </div>
                </div>
                <div>
                  <div className="th">Wyjazd</div>
                  <div className="mt-0.5 text-[13.5px] font-semibold">
                    {dayShortPl(r.checkOut)} · do {property.checkOutTo}
                  </div>
                </div>
              </div>
            </div>
            <CardBody className="pt-3">
              <div className="flex flex-col gap-1.5 border-t border-dashed border-slate-200 pt-3">
                <div className="flex justify-between text-[12.5px] text-slate-600">
                  <span>
                    {nights} {nights === 1 ? "noc" : nights < 5 ? "noce" : "nocy"} ×{" "}
                    {formatPln(perNight)}
                  </span>
                  <span className="tnum">{formatPln(grossGr)}</span>
                </div>
                {r.discountGr > 0 && (
                  <div className="flex justify-between text-[12.5px] text-brand-600">
                    <span>
                      Kod {r.promoCode || "rabatowy"} (−
                      {Math.round((r.discountGr / grossGr) * 100)}%)
                    </span>
                    <span className="tnum">− {formatPln(r.discountGr)}</span>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between border-t border-slate-100 pt-2">
                  <span className="text-sm font-bold">Razem</span>
                  <span className="tnum text-[19px] font-bold">{formatPln(r.totalGr)}</span>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Czat */}
          <Card>
            <div id="czat" />
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <MessageSquare size={16} strokeWidth={2} className="text-brand-600" />
                  Czat z gościem
                </span>
              }
              sub="Gość dostanie powiadomienie e-mailem i odpowie na stronie swojej rezerwacji."
            />
            <CardBody className="space-y-3">
              <ChatThread messages={messages} viewer="OWNER" />
              {r.email && !r.email.endsWith("@rezio.local") ? (
                <form
                  action={sendOwnerMessage}
                  className="flex items-end gap-2 rounded-[11px] border border-slate-200 p-1.5 pl-3"
                >
                  <input type="hidden" name="id" value={r.id} />
                  <textarea
                    name="body"
                    rows={1}
                    required
                    maxLength={2000}
                    placeholder="Napisz wiadomość…"
                    className="min-h-[32px] w-full resize-y bg-transparent py-1.5 text-[12.5px] focus:outline-none"
                  />
                  <SubmitButton
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-brand-900 text-white transition-colors hover:bg-brand-950"
                    title="Wyślij do gościa"
                    // przycisk ma stałe 32px — spinner zastępuje ikonę
                    pendingMode="replace"
                  >
                    <Send size={15} strokeWidth={2} />
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-xs text-accent-500">
                  Uzupełnij e-mail gościa w edycji poniżej, aby pisać wiadomości.
                </p>
              )}
            </CardBody>
          </Card>

          {/* Edycja */}
          <Card>
            <CardHeader title="Edycja rezerwacji" />
            <form action={adminUpdateReservation}>
              <CardBody className="space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <div className="grid grid-cols-2 gap-4">
                  <label className="label">
                    Przyjazd
                    <input type="date" name="from" required defaultValue={r.checkIn} className={input} />
                  </label>
                  <label className="label">
                    Wyjazd
                    <input type="date" name="to" required defaultValue={r.checkOut} className={input} />
                  </label>
                </div>
                <p className="text-xs text-slate-500">
                  Przy zmianie terminu system sprawdzi dostępność i w razie potrzeby przydzieli
                  inną jednostkę tego samego typu. Gość dostanie e-mail o zmianie.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <label className="label">
                    Liczba gości
                    <input type="number" name="guests" min={1} defaultValue={r.guests} className={input} />
                  </label>
                  <label className="label">
                    Cena łączna (zł)
                    <input
                      name="totalZl"
                      required
                      defaultValue={(r.totalGr / 100).toString().replace(".", ",")}
                      className={input}
                    />
                  </label>
                </div>
                <label className="label">
                  Imię i nazwisko *
                  <input name="guestName" required minLength={3} defaultValue={r.guestName} className={input} />
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <label className="label">
                    E-mail
                    <input type="email" name="email" defaultValue={r.email} className={input} />
                  </label>
                  <label className="label">
                    Telefon
                    <input name="phone" defaultValue={r.phone} className={input} />
                  </label>
                </div>
                <label className="label">
                  NIP (do faktury)
                  <input name="nip" defaultValue={r.nip} className={input} />
                </label>
                <label className="label">
                  Notatki
                  <textarea name="notes" rows={3} defaultValue={r.notes} className={input} />
                </label>
                <Button type="submit">Zapisz zmiany</Button>
              </CardBody>
            </form>
          </Card>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-4">
          {/* Gość */}
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white">
                {r.guestName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("")}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{r.guestName}</div>
                <div className="text-[11.5px] text-slate-500">
                  {pastStays > 0
                    ? `${pastStays + 1}. pobyt · gość powracający`
                    : "pierwszy pobyt"}
                </div>
              </div>
            </div>
            <div className="mt-3.5 space-y-2 text-[12.5px] text-slate-600">
              {r.phone && (
                <div className="flex items-center gap-2">
                  <Phone size={14} strokeWidth={2} className="text-slate-400" />
                  {r.phone}
                </div>
              )}
              {r.email && (
                <div className="flex items-center gap-2 break-all">
                  <Mail size={14} strokeWidth={2} className="flex-none text-slate-400" />
                  {r.email}
                </div>
              )}
              {r.notes && (
                <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-500">
                  {r.notes}
                </p>
              )}
            </div>
          </Card>

          {/* Meldunek online */}
          {card ? (
            <div className="rounded-[14px] border border-brand-200 bg-brand-50 p-4">
              <div className="flex items-center gap-2 text-[13.5px] font-bold text-brand-900">
                <Check size={16} strokeWidth={2.4} className="text-brand-600" />
                Meldunek online ukończony
              </div>
              <div className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-slate-600">
                <p>
                  Karta wypełniona i podpisana e-podpisem{" "}
                  {formatDateShortPl(card.completedAt.toISOString().slice(0, 10))}
                  {r.emailVerifiedAt && " · e-mail gościa potwierdzony ✓"}.
                </p>
                <p>
                  {docTypeLabel(card.docType)} {maskDocNumber(card.docNumber)} ·{" "}
                  {card.citizenship}
                  {card.carPlate && ` · auto ${card.carPlate}`}
                  {card.arrivalTime && ` · przyjazd ok. ${card.arrivalTime}`}
                </p>
              </div>
              <Button
                variant="quiet"
                size="sm"
                href={`/admin/rezerwacje/${r.id}/karta`}
                className="mt-3 w-full"
              >
                Karta meldunkowa (podgląd / druk)
              </Button>
            </div>
          ) : (
            <Card className="p-4">
              <div className="text-[13.5px] font-bold">Meldunek online</div>
              {canCheckIn(r) ? (
                <>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">
                    Gość nie wypełnił jeszcze karty meldunkowej.
                  </p>
                  {r.email && !r.email.endsWith("@rezio.local") ? (
                    <form action={adminSendCheckInInvite} className="mt-3">
                      <input type="hidden" name="id" value={r.id} />
                      <Button variant="quiet" size="sm" type="submit" className="w-full">
                        <Mail size={13} strokeWidth={2} /> Wyślij link do meldunku
                      </Button>
                    </form>
                  ) : (
                    <p className="mt-2 text-xs text-accent-500">
                      Uzupełnij e-mail gościa, aby wysłać link do meldunku.
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-500">
                  Meldunek online jest dostępny dla potwierdzonych rezerwacji przed
                  wymeldowaniem.
                </p>
              )}
            </Card>
          )}

          {/* Płatność */}
          <Card className="p-4">
            <div className="mb-2.5 text-[13.5px] font-bold">Płatność</div>
            <div className="space-y-1.5 text-[12.5px] text-slate-600">
              <div className="flex justify-between">
                <span>Zaliczka {r.paymentOrderId ? "(online)" : ""}</span>
                {paidGr > 0 ? (
                  <span className="tnum font-semibold text-brand-600">
                    {formatPln(paidGr)} ✓
                  </span>
                ) : (
                  <span className="tnum">{formatPln(r.depositGr)}</span>
                )}
              </div>
              <div className="flex justify-between">
                <span>Dopłata przy pobycie</span>
                <span className="tnum">{formatPln(Math.max(0, r.totalGr - paidGr))}</span>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-bold">
                <span>Opłacone</span>
                <span className="tnum text-brand-600">
                  {formatPln(paidGr)} / {formatPln(r.totalGr)}
                </span>
              </div>
            </div>
            <ProgressBar
              value={r.totalGr > 0 ? (paidGr / r.totalGr) * 100 : 0}
              className="mt-2.5"
            />
          </Card>

          {/* Faktury */}
          <Card className="p-4">
            <div id="faktury" className="mb-2.5 text-[13.5px] font-bold">
              Faktury
            </div>
            {invoices.length > 0 && (
              <div className="mb-3 space-y-1.5">
                {invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/admin/faktury/${inv.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs transition-colors hover:bg-brand-50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText size={13} strokeWidth={2} className="flex-none text-slate-400" />
                      <span className="tnum truncate font-semibold">{inv.number}</span>
                    </span>
                    <span className="tnum flex-none text-slate-400">
                      {formatPln(inv.grossGr)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline">
                <Plus size={13} strokeWidth={2.4} /> Wystaw fakturę VAT
              </summary>
              <form action={issueInvoice} className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                <input type="hidden" name="reservationId" value={r.id} />
                <div className="grid grid-cols-2 gap-3">
                  <label className="label text-xs">
                    Rodzaj
                    <select name="kind" defaultValue="KONCOWA" className={input}>
                      {INVOICE_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>
                          {k.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="label text-xs">
                    VAT (%)
                    <select name="vatRate" defaultValue="8" className={input}>
                      {VAT_RATES.map((v) => (
                        <option key={v} value={v}>
                          {v}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="label text-xs">
                  Nabywca *
                  <input name="buyerName" required minLength={3} defaultValue={r.guestName} className={input} />
                </label>
                <label className="label text-xs">
                  NIP nabywcy
                  <input name="buyerNip" defaultValue={r.nip} className={input} />
                </label>
                <label className="label text-xs">
                  Adres nabywcy
                  <input name="buyerAddress" defaultValue={card?.address ?? ""} className={input} />
                </label>
                <label className="label text-xs">
                  Nazwa pozycji (puste = domyślna)
                  <input
                    name="itemName"
                    placeholder={`Usługa noclegowa — ${r.unit.unitType.name}`}
                    className={input}
                  />
                </label>
                <p className="text-[11px] text-slate-500">
                  Kwota: {formatPln(r.totalGr)} brutto (zaliczkowa: {formatPln(r.depositGr)}).
                  Dane sprzedawcy z ustawień obiektu.
                </p>
                <Button size="sm" type="submit" className="w-full">
                  Wystaw fakturę
                </Button>
              </form>
            </details>
          </Card>
        </div>
      </div>
    </div>
  );
}
