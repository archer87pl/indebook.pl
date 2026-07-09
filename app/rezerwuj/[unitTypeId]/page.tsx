import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createReservation } from "@/lib/actions";
import { freeUnits } from "@/lib/availability";
import { formatDatePl, isValidISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { quoteStayDynamic } from "@/lib/dynamic-pricing";
import { formatPln, plNights } from "@/lib/format";

export const dynamic = "force-dynamic";

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
    include: { seasons: true, property: true },
  });
  if (!unitType) notFound();
  if (unitType.property.suspended) redirect(`/o/${unitType.property.slug}`);

  const available = await freeUnits(unitType.id, from, to);
  if (available.length === 0) {
    return (
      <div className="max-w-lg mx-auto mt-12 card p-8 text-center space-y-4">
        <p className="text-4xl">😔</p>
        <h1 className="text-xl font-bold text-brand-950">
          Brak wolnych pokoi „{unitType.name}&rdquo; w terminie {formatDatePl(from)} →{" "}
          {formatDatePl(to)}
        </h1>
        <p className="text-sm text-slate-600">
          Sprawdź inne daty albo pozostałe pokoje obiektu {unitType.property.name}.
        </p>
        <Link href={`/o/${unitType.property.slug}`} className="btn-primary">
          Wróć i wybierz inny termin
        </Link>
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
    <div className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-brand-950">Dane rezerwacji</h1>
        {sp.error && <p className="alert-error">{sp.error}</p>}
        <form action={createReservation} className="card p-6 space-y-4">
          <input type="hidden" name="unitTypeId" value={unitType.id} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="guests" value={guests} />
          <label className="label">
            Imię i nazwisko *
            <input name="guestName" required minLength={3} className="input w-full" />
          </label>
          <label className="label">
            E-mail *
            <input type="email" name="email" required className="input w-full" />
          </label>
          <label className="label">
            Telefon
            <input type="tel" name="phone" className="input w-full" />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="label">
              NIP (do faktury, opcjonalnie)
              <input name="nip" className="input w-full" />
            </label>
            <label className="label">
              Kod promocyjny
              <input name="promo" placeholder="np. LATO10" className="input w-full uppercase font-mono" />
            </label>
          </div>
          <label className="label">
            Uwagi do rezerwacji
            <textarea name="notes" rows={3} className="input w-full" />
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-600">
            <input type="checkbox" name="rodo" required className="mt-1 accent-teal-700" />
            <span>
              Wyrażam zgodę na przetwarzanie moich danych osobowych w celu realizacji
              rezerwacji (RODO) i akceptuję{" "}
              <a
                href={`/o/${unitType.property.slug}/regulamin`}
                target="_blank"
                className="text-brand-700 font-semibold hover:underline"
              >
                regulamin obiektu
              </a>
              . *
            </span>
          </label>
          <button type="submit" className="btn-primary w-full py-3">
            Rezerwuję — przejdź do zaliczki
          </button>
          <p className="text-xs text-slate-500">
            Rezerwacja jest wstępna przez 30 minut — potwierdza ją wpłata zaliczki{" "}
            {formatPln(quote.depositGr)}.
          </p>
        </form>
      </div>

      <aside className="card p-6 h-fit space-y-3">
        <h2 className="font-bold text-lg text-brand-950">{unitType.name}</h2>
        <p className="text-sm text-slate-600">
          {formatDatePl(from)} → {formatDatePl(to)}
        </p>
        <p className="text-sm text-slate-600">
          {plNights(quote.nights)} · {guests} os.
        </p>
        <hr className="border-slate-200" />
        <div className="space-y-1 text-sm">
          {quote.nightly.map((n) => (
            <div key={n.date} className="flex justify-between text-slate-500">
              <span>{n.date}</span>
              <span>{formatPln(n.priceGr)}</span>
            </div>
          ))}
        </div>
        <hr className="border-slate-200" />
        <div className="flex justify-between font-bold text-brand-950">
          <span>Razem</span>
          <span>{formatPln(quote.totalGr)}</span>
        </div>
        <div className="flex justify-between text-sm text-brand-700 font-semibold">
          <span>Zaliczka ({unitType.property.depositPercent}%)</span>
          <span>{formatPln(quote.depositGr)}</span>
        </div>
      </aside>
    </div>
  );
}
