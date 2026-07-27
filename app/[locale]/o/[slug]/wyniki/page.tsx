import { ArrowLeft, Ban, CalendarX, Users } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { localePath } from "@/lib/locale-urls";
import { Link } from "@/i18n/navigation";
import { notFound } from "next/navigation";
import SearchForm from "@/components/SearchForm";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { freeUnits } from "@/lib/availability";
import { formatDate, isValidISO, nightsBetween, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { quoteStayDynamic } from "@/lib/dynamic-pricing";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const PHOTO_TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 8px,#e6ede9 8px,#e6ede9 16px)";

export default async function ResultsPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string; guests?: string }>;
}) {
  const { slug } = await props.params;
  const locale = await getLocale();
  const t = await getTranslations("search");
  const tp = await getTranslations("property");
  const tc = await getTranslations("common");
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
            title={tp("suspended.title")}
            action={
              <Button href={localePath("/", locale)}>
                {tp("suspended.browseOther")}
              </Button>
            }
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
        <p className="alert-error">{t("invalidRange")}</p>
      ) : (
        <>
          <h1 className="text-[25px] font-bold text-brand-950">
            {formatDate(from, locale)} – {formatDate(to, locale)}{" "}
            <span className="font-normal text-slate-400">
              · {tc("nights", { count: nightsBetween(from, to) })} ·{" "}
              {tc("guests", { count: guests })}
            </span>
          </h1>
          {offers.length === 0 && (
            <Card>
              <EmptyState
                icon={<CalendarX size={26} strokeWidth={2} />}
                title={t("noResults.title")}
                description={t("noResults.description")}
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
                    <span className="tnum text-[10px] text-slate-400">
                      {t("photoPlaceholder")}
                    </span>
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
                      {tp("upToGuests", { count: o.maxGuests })}
                    </p>
                    {o.description && (
                      <p className="text-[12.5px] leading-relaxed text-slate-600">
                        {o.description}
                      </p>
                    )}
                    <Badge tone="success">{t("available", { count: o.available })}</Badge>
                  </div>
                  <div className="flex flex-col items-end justify-between gap-2 text-right">
                    <div>
                      <p className="tnum text-[19px] font-bold text-slate-900">
                        {formatMoney(o.totalGr, locale)}
                      </p>
                      <p className="text-[10.5px] text-slate-400">
                        {t("totalFor", { count: o.nights })}
                      </p>
                    </div>
                    {o.tooShort ? (
                      <Badge tone="warning">
                        {t("minStayBadge", { count: o.tooShort })}
                      </Badge>
                    ) : (
                      <Button
                        href={localePath(
                          `/rezerwuj/${o.unitTypeId}?from=${from}&to=${to}&guests=${guests}`,
                          locale,
                        )}
                      >
                        {t("bookCta")}
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
