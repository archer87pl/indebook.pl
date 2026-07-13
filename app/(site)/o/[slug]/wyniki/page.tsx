import { ArrowLeft, Ban, CalendarX, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import SearchForm from "@/components/SearchForm";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { freeUnits } from "@/lib/availability";
import { formatDatePl, isValidISO, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { quoteStayDynamic } from "@/lib/dynamic-pricing";
import { formatPln, plNights } from "@/lib/format";

export const dynamic = "force-dynamic";

const PHOTO_TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 8px,#e6ede9 8px,#e6ede9 16px)";

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
  if (property.suspended) {
    return (
      <div className="mx-auto mt-12 max-w-lg">
        <Card>
          <EmptyState
            icon={<Ban size={26} strokeWidth={2} />}
            title="Ten obiekt jest obecnie niedostępny"
            action={<Button href="/">Przeglądaj inne obiekty</Button>}
          />
        </Card>
      </div>
    );
  }

  const offers: {
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
    // sekwencyjnie — pula połączeń Prisma ma limit 1
    for (const ut of property.unitTypes.filter((u) => u.maxGuests >= guests)) {
      const units = await freeUnits(ut.id, from, to);
      if (units.length === 0) continue;
      const quote = await quoteStayDynamic(ut, from, to, property.depositPercent);
      offers.push({
        unitTypeId: ut.id,
        name: ut.name,
        description: ut.description,
        maxGuests: ut.maxGuests,
        totalGr: quote.totalGr,
        nights: quote.nights,
        available: units.length,
        tooShort: quote.nights < quote.minStay ? quote.minStay : null,
      });
    }
  }

  return (
    <div className="space-y-6">
      <p>
        <Link
          href={`/o/${property.slug}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          {property.name}
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
          <h1 className="text-[25px] font-bold text-brand-950">
            {formatDatePl(from)} – {formatDatePl(to)}{" "}
            <span className="font-normal text-slate-400">
              · {plNights(nightsBetween(from, to))} · {guests} os.
            </span>
          </h1>
          {offers.length === 0 && (
            <Card>
              <EmptyState
                icon={<CalendarX size={26} strokeWidth={2} />}
                title="Brak dostępnych pokoi w tym terminie"
                description="Spróbuj innych dat — dostępność zmienia się na bieżąco."
              />
            </Card>
          )}
          <div className="space-y-3">
            {offers.map((o) => (
              <Card key={o.unitTypeId} className="p-3.5 sm:p-[14px]">
                <div className="flex flex-wrap gap-[14px]">
                  <div
                    className="flex h-[88px] w-[120px] flex-none items-center justify-center rounded-[11px]"
                    style={{ background: PHOTO_TEXTURE }}
                  >
                    <span className="tnum text-[10px] text-slate-400">zdjęcie</span>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <h2 className="text-[14.5px] font-bold">
                      <Link
                        href={`/o/${property.slug}/pokoj/${o.unitTypeId}`}
                        className="text-brand-950 hover:text-brand-700 hover:underline"
                      >
                        {o.name}
                      </Link>
                    </h2>
                    <p className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                      <Users size={13} strokeWidth={2} />
                      do {o.maxGuests} os.
                    </p>
                    {o.description && (
                      <p className="text-[12.5px] leading-relaxed text-slate-600">
                        {o.description}
                      </p>
                    )}
                    <Badge tone="success">wolne: {o.available}</Badge>
                  </div>
                  <div className="flex flex-col items-end justify-between gap-2 text-right">
                    <div>
                      <p className="tnum text-[19px] font-bold text-slate-900">
                        {formatPln(o.totalGr)}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        łącznie za {plNights(o.nights)}
                      </p>
                    </div>
                    {o.tooShort ? (
                      <Badge tone="warning">
                        min. pobyt: {plNights(o.tooShort)}
                      </Badge>
                    ) : (
                      <Button
                        href={`/rezerwuj/${o.unitTypeId}?from=${from}&to=${to}&guests=${guests}`}
                      >
                        Rezerwuję
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
