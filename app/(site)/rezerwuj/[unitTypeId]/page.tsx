import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarX, Lock } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { createReservation } from "@/lib/actions";
import { freeUnits } from "@/lib/availability";
import { formatDatePl, isValidISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { quoteStayDynamic } from "@/lib/dynamic-pricing";
import { formatPln, plNights } from "@/lib/format";

export const dynamic = "force-dynamic";

const TEXTURE =
  "repeating-linear-gradient(45deg,#e6ede9,#e6ede9 7px,#dde5e0 7px,#dde5e0 14px)";

function dayShortPl(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default async function BookPage(props: {
  params: Promise<{ unitTypeId: string }>;
  searchParams: Promise<{ from?: string; to?: string; guests?: string; error?: string }>;
}) {
  const { unitTypeId } = await props.params;
  const sp = await props.searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const guests = Math.max(1, Number(sp.guests) || 1);

  if (!isValidISO(from) || !isValidISO(to) || from >= to || from < todayISO()) {
    redirect("/");
  }

  const unitType = await prisma.unitType.findUnique({
    where: { id: Number(unitTypeId) },
    include: { seasons: true, property: true, photos: { take: 1 } },
  });
  if (!unitType) notFound();
  if (unitType.property.suspended) redirect(`/o/${unitType.property.slug}`);

  const available = await freeUnits(unitType.id, from, to);
  if (available.length === 0) {
    return (
      <div className="card mx-auto mt-12 max-w-lg space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-100 text-danger-600">
          <CalendarX size={26} strokeWidth={2} />
        </div>
        <h1 className="text-xl font-bold">
          Brak wolnych pokoi „{unitType.name}&rdquo; w terminie {formatDatePl(from)} →{" "}
          {formatDatePl(to)}
        </h1>
        <p className="text-sm text-slate-600">
          Sprawdź inne daty albo pozostałe pokoje obiektu {unitType.property.name}.
        </p>
        <Button href={`/o/${unitType.property.slug}`}>Wróć i wybierz inny termin</Button>
      </div>
    );
  }

  const quote = await quoteStayDynamic(
    unitType,
    from,
    to,
    unitType.property.depositPercent
  );

  return (
    <div className="space-y-5">
      {/* Wskaźnik kroku (16b) */}
      <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
          1
        </span>
        Pokój
        <span className="h-px w-6 bg-slate-300" />
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white">
          2
        </span>
        <span className="font-semibold text-brand-900">Dane i zaliczka</span>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}

      <div className="grid items-start gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Twoje dane" />
          <form action={createReservation}>
            <CardBody className="space-y-4">
              <input type="hidden" name="unitTypeId" value={unitType.id} />
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="guests" value={guests} />
              <label className="label">
                Imię i nazwisko *
                <input name="guestName" required minLength={3} className="input w-full" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="label">
                  E-mail *
                  <input type="email" name="email" required className="input w-full" />
                </label>
                <label className="label">
                  Telefon
                  <input type="tel" name="phone" className="input w-full" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="label">
                  NIP (do faktury, opcjonalnie)
                  <input name="nip" className="input w-full" />
                </label>
                <label className="label">
                  Kod promocyjny
                  <input
                    name="promo"
                    placeholder="np. LATO10"
                    className="input tnum w-full uppercase"
                  />
                </label>
              </div>
              <label className="label">
                Uwagi dla gospodarza (opcjonalnie)
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="np. przyjazd ok. 15:00, prosimy o łóżeczko dla dziecka"
                  className="input w-full"
                />
              </label>
              <label className="flex items-start gap-2 text-sm text-slate-600">
                <input type="checkbox" name="rodo" required className="mt-1 accent-brand-600" />
                <span>
                  Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji
                  rezerwacji (RODO) i akceptuję{" "}
                  <a
                    href={`/o/${unitType.property.slug}/regulamin`}
                    target="_blank"
                    className="font-semibold text-brand-600 hover:underline"
                  >
                    regulamin obiektu
                  </a>
                  . *
                </span>
              </label>
              <Button type="submit" size="lg" className="w-full">
                Zapłać {formatPln(quote.depositGr)} i rezerwuj
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-[10.5px] text-slate-400">
                <Lock size={11} strokeWidth={2} />
                Płatność szyfrowana · Przelewy24 (BLIK, karta, przelew)
              </p>
              <p className="text-xs text-slate-500">
                Rezerwacja jest wstępna przez 30 minut — potwierdza ją wpłata zaliczki{" "}
                {formatPln(quote.depositGr)}.
              </p>
            </CardBody>
          </form>
        </Card>

        {/* Podsumowanie (16b) */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white md:sticky md:top-[76px]">
          <div className="flex gap-3 border-b border-slate-100 p-4">
            {unitType.photos[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={unitType.photos[0].path}
                alt={unitType.name}
                className="h-[60px] w-[72px] flex-none rounded-[10px] object-cover"
              />
            ) : (
              <div
                className="h-[60px] w-[72px] flex-none rounded-[10px]"
                style={{ background: TEXTURE }}
              />
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{unitType.name}</div>
              <div className="mt-0.5 text-[11.5px] text-slate-400">
                {unitType.property.name}
                {unitType.property.address && ` · ${unitType.property.address}`}
              </div>
            </div>
          </div>
          <div className="space-y-1.5 border-b border-slate-100 p-4 text-[12.5px]">
            <div className="flex justify-between">
              <span className="text-slate-400">Przyjazd</span>
              <span className="font-semibold">
                {dayShortPl(from)} · {unitType.property.checkInFrom}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Wyjazd</span>
              <span className="font-semibold">
                {dayShortPl(to)} · {unitType.property.checkOutTo}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Goście</span>
              <span className="font-semibold">{guests} os.</span>
            </div>
          </div>
          <div className="p-4">
            <details className="group mb-2">
              <summary className="flex cursor-pointer list-none justify-between text-[12.5px] text-slate-600">
                <span className="underline decoration-dotted underline-offset-2">
                  Pobyt ({plNights(quote.nights)})
                </span>
                <span className="tnum">{formatPln(quote.totalGr)}</span>
              </summary>
              <div className="mt-2 space-y-1 border-l-2 border-slate-100 pl-3">
                {quote.nightly.map((n) => (
                  <div
                    key={n.date}
                    className="flex justify-between text-[11.5px] text-slate-400"
                  >
                    <span className="tnum">{n.date}</span>
                    <span className="tnum">{formatPln(n.priceGr)}</span>
                  </div>
                ))}
              </div>
            </details>
            <div className="mb-3 flex justify-between border-t border-slate-100 pt-2.5 text-sm font-bold">
              <span>Razem</span>
              <span className="tnum">{formatPln(quote.totalGr)}</span>
            </div>
            <div className="rounded-[11px] bg-brand-50 px-3.5 py-3">
              <div className="flex justify-between text-[13px] font-bold text-brand-900">
                <span>Zaliczka teraz ({unitType.property.depositPercent}%)</span>
                <span className="tnum">{formatPln(quote.depositGr)}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Pozostałe {formatPln(quote.totalGr - quote.depositGr)} przy przyjeździe
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] text-slate-400">
              <Link
                href={`/o/${unitType.property.slug}`}
                className="hover:underline"
              >
                ← Wróć do strony obiektu
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
