import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Construction, FileText, MapPin, ShieldCheck, Star } from "lucide-react";
import SearchForm from "@/components/SearchForm";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { formatDatePl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { averageRating } from "@/lib/reviews";

// ISR: publiczna strona obiektu cache'owana, odświeżana co 2 min
// (dostępność liczona jest osobno w /wyniki, które pozostaje dynamiczne).
// updateProperty woła revalidatePath(`/o/${slug}`) dla natychmiastowej zmiany.
export const revalidate = 120;

const TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 10px,#e6ede9 10px,#e6ede9 20px)";

function Stars({ value, size = 13 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex gap-px text-accent-400" aria-label={`${value} / 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={2}
          fill={i < Math.round(value) ? "currentColor" : "none"}
          className={i < Math.round(value) ? "" : "text-slate-300"}
        />
      ))}
    </span>
  );
}

export default async function PropertyPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      photos: { where: { propertyId: { not: null } }, orderBy: { id: "asc" } },
      faqs: { orderBy: [{ sort: "asc" }, { id: "asc" }] },
      unitTypes: {
        include: { units: true, photos: { orderBy: { id: "asc" } } },
        orderBy: { id: "asc" },
      },
    },
  });
  if (!property) notFound();
  if (property.suspended) {
    return (
      <div className="card mx-auto mt-12 max-w-lg space-y-4 p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-100 text-accent-500">
          <Construction size={26} strokeWidth={2} />
        </div>
        <h1 className="text-xl font-bold">Ten obiekt jest obecnie niedostępny</h1>
        <p className="text-sm text-slate-600">
          Strona rezerwacji obiektu {property.name} jest tymczasowo wyłączona.
        </p>
        <Button href="/">Przeglądaj inne obiekty</Button>
      </div>
    );
  }

  const reviews = await prisma.review.findMany({
    where: { propertyId: property.id, hidden: false },
    orderBy: { createdAt: "desc" },
  });
  const avg = averageRating(reviews.map((r) => r.rating));

  const photos = property.photos;
  const ratingJsonLd =
    reviews.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "LodgingBusiness",
          name: property.name,
          address: property.address || undefined,
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: avg,
            reviewCount: reviews.length,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : null;
  const faqJsonLd =
    property.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: property.faqs.map((f) => ({
            "@type": "Question",
            name: f.question,
            acceptedAnswer: { "@type": "Answer", text: f.answer },
          })),
        }
      : null;

  return (
    <div className="space-y-10">
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      {ratingJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ratingJsonLd) }}
        />
      )}

      {/* Galeria (16a) */}
      <section className="grid grid-cols-[2fr_1fr_1fr] gap-2">
        {photos[0] ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photos[0].path}
            alt={property.name}
            className="h-[220px] w-full rounded-l-[14px] object-cover"
          />
        ) : (
          <div
            className="tnum flex h-[220px] items-center justify-center rounded-l-[14px] text-[11px] text-slate-400"
            style={{ background: TEXTURE }}
          >
            zdjęcie główne
          </div>
        )}
        <div className="flex flex-col gap-2">
          {[1, 2].map((i) =>
            photos[i] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img key={i} src={photos[i].path} alt="" className="min-h-0 flex-1 object-cover" />
            ) : (
              <div key={i} className="min-h-0 flex-1" style={{ background: TEXTURE }} />
            ),
          )}
        </div>
        <div className="flex flex-col gap-2">
          {photos[3] ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={photos[3].path} alt="" className="min-h-0 flex-1 rounded-tr-[14px] object-cover" />
          ) : (
            <div className="min-h-0 flex-1 rounded-tr-[14px]" style={{ background: TEXTURE }} />
          )}
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center rounded-br-[14px] text-xs font-bold text-slate-600"
            style={
              photos[4] ? undefined : { background: TEXTURE }
            }
          >
            {photos[4] && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photos[4].path}
                alt=""
                className="absolute inset-0 h-full w-full rounded-br-[14px] object-cover"
              />
            )}
            {photos.length > 5 && (
              <span className="relative rounded-full bg-white/90 px-2.5 py-1">
                +{photos.length - 5} zdjęć
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-[1fr_340px]">
        {/* Lewa kolumna */}
        <div className="min-w-0 space-y-10">
          <section>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <h1 className="text-[26px] font-bold">{property.name}</h1>
              <span className="flex items-center gap-3 text-[12.5px] text-slate-600">
                {property.address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={13} strokeWidth={2} className="text-slate-400" />
                    {property.address}
                  </span>
                )}
                {reviews.length > 0 && (
                  <a href="#opinie" className="flex items-center gap-1 hover:underline">
                    <Star size={13} strokeWidth={2} fill="#c9992b" className="text-accent-400" />
                    {avg.toFixed(1).replace(".", ",")}
                  </a>
                )}
                <Badge tone="success">0% prowizji</Badge>
              </span>
            </div>
            {property.description && (
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-slate-500">
                {property.description}
              </p>
            )}
          </section>

          {/* Pokoje (16a — poziome karty) */}
          <section>
            <h2 className="mb-3 text-base font-bold">Nasze pokoje</h2>
            {property.unitTypes.length === 0 && (
              <p className="card px-6 py-8 text-center text-slate-500">
                Ten obiekt nie dodał jeszcze swojej oferty.
              </p>
            )}
            <div className="flex flex-col gap-3">
              {property.unitTypes.map((ut) => {
                const amenityDefs = AMENITIES.filter((a) =>
                  parseAmenities(ut.amenities).includes(a.key),
                );
                return (
                  <div
                    key={ut.id}
                    className="flex flex-wrap gap-3.5 rounded-[14px] border border-slate-200 bg-white p-3.5 transition-colors hover:border-brand-600 sm:flex-nowrap"
                  >
                    {ut.photos[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={ut.photos[0].path}
                        alt={ut.name}
                        className="h-[88px] w-[120px] flex-none rounded-[11px] object-cover"
                      />
                    ) : (
                      <div
                        className="h-[88px] w-[120px] flex-none rounded-[11px]"
                        style={{ background: TEXTURE }}
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/o/${property.slug}/pokoj/${ut.id}`}
                        className="text-[14.5px] font-bold hover:underline"
                      >
                        {ut.name}
                      </Link>
                      <p className="mb-2 mt-0.5 text-[11.5px] text-slate-400">
                        do {ut.maxGuests} os. · {ut.units.length}{" "}
                        {ut.units.length === 1 ? "jednostka" : "jednostki"}
                        {ut.minStay > 1 && ` · min. ${ut.minStay} nocy`}
                      </p>
                      {amenityDefs.length > 0 && (
                        <p className="flex flex-wrap gap-1.5">
                          {amenityDefs.slice(0, 4).map((a) => (
                            <span
                              key={a.key}
                              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600"
                            >
                              {a.icon} {a.label}
                            </span>
                          ))}
                          {amenityDefs.length > 4 && (
                            <span className="px-1 text-[10.5px] text-slate-400">
                              +{amenityDefs.length - 4}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-none flex-col items-end justify-between gap-2">
                      <div className="text-right">
                        <div className="tnum text-[19px] font-bold">
                          {formatPln(ut.basePriceGr)}
                        </div>
                        <div className="text-[10.5px] text-slate-400">za noc</div>
                      </div>
                      <Button size="sm" href={`/o/${property.slug}/pokoj/${ut.id}`}>
                        Zobacz pokój
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Opinie */}
          {reviews.length > 0 && (
            <section id="opinie" className="scroll-mt-20 space-y-4">
              <div className="flex items-baseline gap-3">
                <h2 className="text-base font-bold">Opinie gości</h2>
                <span className="flex items-center gap-1.5 text-sm text-slate-500">
                  <Stars value={avg} />
                  {avg.toFixed(1).replace(".", ",")} / 5 · {reviews.length}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {reviews.map((rev) => (
                  <div key={rev.id} className="card space-y-2 p-5">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{rev.authorName}</span>
                      <Stars value={rev.rating} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {formatDatePl(rev.createdAt.toISOString().slice(0, 10))}
                    </p>
                    {rev.comment && (
                      <p className="whitespace-pre-line text-sm text-slate-600">
                        {rev.comment}
                      </p>
                    )}
                    {rev.ownerReply && (
                      <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                        <p className="text-xs font-semibold text-brand-700">
                          Odpowiedź obiektu
                        </p>
                        <p className="whitespace-pre-line text-slate-600">{rev.ownerReply}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* FAQ obiektu */}
          {property.faqs.length > 0 && (
            <section className="space-y-4">
              <h2 className="text-base font-bold">Najczęstsze pytania</h2>
              <div className="space-y-3">
                {property.faqs.map((f) => (
                  <details key={f.id} className="card overflow-hidden">
                    <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-semibold transition-colors hover:bg-brand-50">
                      {f.question}
                    </summary>
                    <p className="whitespace-pre-line px-5 pb-4 pt-1 text-sm leading-relaxed text-slate-600">
                      {f.answer}
                    </p>
                  </details>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sticky widget rezerwacji (16a) */}
        <div className="space-y-3 lg:sticky lg:top-[76px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-[18px] shadow-[0_12px_30px_-16px_rgba(15,35,26,0.3)]">
            <div className="mb-3.5 flex items-baseline gap-1.5">
              {property.unitTypes.length > 0 && (
                <>
                  <span className="tnum text-[22px] font-bold">
                    od{" "}
                    {formatPln(Math.min(...property.unitTypes.map((ut) => ut.basePriceGr)))}
                  </span>
                  <span className="text-[13px] text-slate-400">/ noc</span>
                </>
              )}
            </div>
            <SearchForm action={`/o/${property.slug}/wyniki`} variant="widget" />
            <p className="mt-2.5 text-center text-[11px] leading-relaxed text-slate-400">
              Zaliczka {property.depositPercent}% online · reszta przy przyjeździe
            </p>
          </div>
          <div className="flex items-center gap-2.5 rounded-[11px] bg-brand-50 px-3.5 py-3">
            <ShieldCheck size={16} strokeWidth={2} className="flex-none text-brand-600" />
            <span className="text-[11.5px] leading-snug text-brand-900">
              Rezerwacja bezpośrednio u gospodarza — najlepsza cena, bez prowizji.
            </span>
          </div>
          <div className="card space-y-2 px-4 py-3.5 text-[12.5px] text-slate-500">
            <p className="flex items-center gap-2">
              <Clock size={13} strokeWidth={2} className="text-slate-400" />
              zameldowanie od {property.checkInFrom} · wymeldowanie do {property.checkOutTo}
            </p>
            {(property.terms || property.privacyPolicy) && (
              <p className="flex items-center gap-2">
                <FileText size={13} strokeWidth={2} className="text-slate-400" />
                <a
                  href={`/o/${property.slug}/regulamin`}
                  className="font-medium text-brand-600 hover:underline"
                >
                  Regulamin i polityka prywatności
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Pozostałe zdjęcia */}
      {photos.length > 5 && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.slice(5).map((p) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={p.id}
              src={p.path}
              alt=""
              className="h-36 w-full rounded-xl border border-slate-200 object-cover"
            />
          ))}
        </section>
      )}
    </div>
  );
}
