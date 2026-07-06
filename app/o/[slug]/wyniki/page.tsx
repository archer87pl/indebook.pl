import Link from "next/link";
import { notFound } from "next/navigation";
import SearchForm from "@/components/SearchForm";
import { freeUnits } from "@/lib/availability";
import { formatDatePl, isValidISO, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln, plNights } from "@/lib/format";
import { quoteStay } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export default async function ResultsPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string; guests?: string }>;
}) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const guests = Math.max(1, Number(sp.guests) || 1);

  const valid =
    isValidISO(from) && isValidISO(to) && from < to && from >= todayISO();

  const property = await prisma.property.findUnique({
    where: { slug },
    include: { unitTypes: { include: { seasons: true } } },
  });
  if (!property) notFound();

  let offers: {
    unitTypeId: number;
    name: string;
    description: string;
    maxGuests: number;
    totalGr: number;
    nights: number;
    available: number;
    tooShort: number | null;
  }[] = [];

  if (valid) {
    offers = (
      await Promise.all(
        property.unitTypes
          .filter((ut) => ut.maxGuests >= guests)
          .map(async (ut) => {
            const units = await freeUnits(ut.id, from, to);
            if (units.length === 0) return null;
            const quote = quoteStay(ut, from, to, property.depositPercent);
            return {
              unitTypeId: ut.id,
              name: ut.name,
              description: ut.description,
              maxGuests: ut.maxGuests,
              totalGr: quote.totalGr,
              nights: quote.nights,
              available: units.length,
              tooShort: quote.nights < quote.minStay ? quote.minStay : null,
            };
          })
      )
    ).filter((o) => o !== null);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500">
        <Link href={`/o/${property.slug}`} className="text-brand-700 hover:underline">
          ← {property.name}
        </Link>
      </p>
      <SearchForm
        action={`/o/${property.slug}/wyniki`}
        from={valid ? from : undefined}
        to={valid ? to : undefined}
        guests={guests}
      />

      {!valid ? (
        <p className="alert-error">
          Nieprawidłowy zakres dat — wybierz termin od dziś, wyjazd po przyjeździe.
        </p>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-brand-950">
            {formatDatePl(from)} → {formatDatePl(to)}{" "}
            <span className="text-slate-400 font-normal">
              · {plNights(nightsBetween(from, to))} · {guests} os.
            </span>
          </h1>
          {offers.length === 0 && (
            <p className="card px-6 py-8 text-center text-slate-500">
              Brak dostępnych pokoi w tym terminie. Spróbuj innych dat.
            </p>
          )}
          <div className="space-y-4">
            {offers.map((o) => (
              <div
                key={o.unitTypeId}
                className="card p-5 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <h2 className="font-bold text-lg">
                    <Link
                      href={`/o/${property.slug}/pokoj/${o.unitTypeId}`}
                      className="text-brand-950 hover:text-brand-700 hover:underline"
                    >
                      {o.name}
                    </Link>
                  </h2>
                  <p className="text-sm text-slate-600">{o.description}</p>
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    do {o.maxGuests} os. · wolne: {o.available}
                  </p>
                </div>
                <div className="text-right space-y-2">
                  <p className="text-2xl font-black text-brand-700">
                    {formatPln(o.totalGr)}
                  </p>
                  <p className="text-xs text-slate-500">
                    łącznie za {plNights(o.nights)}
                  </p>
                  {o.tooShort ? (
                    <p className="text-sm text-accent-700 font-medium">
                      Min. pobyt w tym terminie: {plNights(o.tooShort)}
                    </p>
                  ) : (
                    <Link
                      href={`/rezerwuj/${o.unitTypeId}?from=${from}&to=${to}&guests=${guests}`}
                      className="btn-primary"
                    >
                      Rezerwuj
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
