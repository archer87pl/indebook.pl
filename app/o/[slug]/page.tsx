import Link from "next/link";
import { notFound } from "next/navigation";
import SearchForm from "@/components/SearchForm";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { formatDatePl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { averageRating, stars } from "@/lib/reviews";

export const dynamic = "force-dynamic";

const ROOM_ICONS = ["🛏️", "👨‍👩‍👧‍👦", "🏡", "🌅", "🚿", "🔑"];

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
      <div className="max-w-lg mx-auto mt-12 card p-8 text-center space-y-3">
        <p className="text-4xl">🚧</p>
        <h1 className="text-xl font-bold text-brand-950">
          Ten obiekt jest obecnie niedostępny
        </h1>
        <p className="text-sm text-slate-600">
          Strona rezerwacji obiektu {property.name} jest tymczasowo wyłączona.
        </p>
        <Link href="/" className="btn-primary">
          Przeglądaj inne obiekty
        </Link>
      </div>
    );
  }

  const reviews = await prisma.review.findMany({
    where: { propertyId: property.id, hidden: false },
    orderBy: { createdAt: "desc" },
  });
  const avg = averageRating(reviews.map((r) => r.rating));

  const cover = property.photos[0]?.path;
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
    <div className="space-y-12">
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
      <section>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 via-brand-800 to-brand-600 px-8 pt-12 pb-20 text-white shadow-lg">
          {cover && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cover}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-brand-950/85 via-brand-900/70 to-brand-900/40" />
            </>
          )}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 80% 20%, #fbbf24 0, transparent 40%), radial-gradient(circle at 10% 90%, #99f6e4 0, transparent 35%)",
            }}
          />
          <p className="relative text-sm font-semibold uppercase tracking-widest text-accent-400">
            Rezerwuj bezpośrednio — bez prowizji
          </p>
          <h1 className="relative mt-3 text-4xl sm:text-5xl font-black tracking-tight">
            {property.name}
          </h1>
          <p className="relative mt-4 max-w-2xl text-brand-100/90">
            {property.description}
          </p>
          {reviews.length > 0 && (
            <a
              href="#opinie"
              className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur px-4 py-1.5 text-sm font-semibold hover:bg-white/20"
            >
              <span className="text-accent-400">{stars(avg)}</span>
              {avg.toFixed(1).replace(".", ",")} ·{" "}
              {reviews.length}{" "}
              {reviews.length === 1 ? "opinia" : reviews.length < 5 ? "opinie" : "opinii"}
            </a>
          )}
        </div>
        <div className="-mt-10 mx-4 sm:mx-8 relative z-10">
          <SearchForm action={`/o/${property.slug}/wyniki`} />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold text-brand-950 mb-5">Nasze pokoje</h2>
        {property.unitTypes.length === 0 && (
          <p className="card px-6 py-8 text-center text-slate-500">
            Ten obiekt nie dodał jeszcze swojej oferty.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {property.unitTypes.map((ut, i) => {
            const amenityDefs = AMENITIES.filter((a) =>
              parseAmenities(ut.amenities).includes(a.key)
            );
            return (
              <Link
                key={ut.id}
                href={`/o/${property.slug}/pokoj/${ut.id}`}
                className="card overflow-hidden flex flex-col hover:border-brand-500 hover:shadow-md transition-all"
              >
                {ut.photos[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={ut.photos[0].path}
                    alt={ut.name}
                    className="h-40 w-full object-cover"
                  />
                ) : (
                  <div className="h-28 grid place-items-center text-5xl bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100">
                    {ROOM_ICONS[i % ROOM_ICONS.length]}
                  </div>
                )}
                <div className="p-5 space-y-2 flex-1 flex flex-col">
                  <h3 className="font-bold text-brand-950">{ut.name}</h3>
                  <p className="text-sm text-slate-600 flex-1">{ut.description}</p>
                  {amenityDefs.length > 0 && (
                    <p className="text-sm text-slate-500" title={amenityDefs.map((a) => a.label).join(", ")}>
                      {amenityDefs.slice(0, 5).map((a) => a.icon).join(" ")}
                      {amenityDefs.length > 5 && (
                        <span className="text-xs"> +{amenityDefs.length - 5}</span>
                      )}
                    </p>
                  )}
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                    do {ut.maxGuests} os. · {ut.units.length}{" "}
                    {ut.units.length === 1 ? "jednostka" : "jednostki"}
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-bold text-brand-700">
                      od {formatPln(ut.basePriceGr)}{" "}
                      <span className="text-sm font-medium text-slate-400">/ noc</span>
                    </p>
                    <span className="text-sm font-semibold text-brand-700">
                      Zobacz pokój →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {property.photos.length > 1 && (
        <section className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {property.photos.slice(1).map((p) => (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={p.id}
              src={p.path}
              alt=""
              className="h-36 w-full object-cover rounded-xl border border-slate-200"
            />
          ))}
        </section>
      )}

      {reviews.length > 0 && (
        <section id="opinie" className="space-y-5 max-w-3xl scroll-mt-20">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-bold text-brand-950">Opinie gości</h2>
            <span className="text-sm text-slate-500">
              <span className="text-accent-500">{stars(avg)}</span>{" "}
              {avg.toFixed(1).replace(".", ",")} / 5 · {reviews.length}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {reviews.map((rev) => (
              <div key={rev.id} className="card p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-brand-950">
                    {rev.authorName}
                  </span>
                  <span className="text-accent-500" title={`${rev.rating}/5`}>
                    {stars(rev.rating)}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  {formatDatePl(rev.createdAt.toISOString().slice(0, 10))}
                </p>
                {rev.comment && (
                  <p className="text-sm text-slate-600 whitespace-pre-line">
                    {rev.comment}
                  </p>
                )}
                {rev.ownerReply && (
                  <div className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-sm">
                    <p className="text-xs font-semibold text-brand-700">
                      Odpowiedź obiektu
                    </p>
                    <p className="text-slate-600 whitespace-pre-line">
                      {rev.ownerReply}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {property.faqs.length > 0 && (
        <section className="space-y-4 max-w-3xl">
          <h2 className="text-2xl font-bold text-brand-950">Najczęstsze pytania</h2>
          <div className="space-y-3">
            {property.faqs.map((f) => (
              <details key={f.id} className="card overflow-hidden">
                <summary className="cursor-pointer select-none px-6 py-4 font-semibold text-brand-950 hover:bg-brand-50 transition-colors">
                  {f.question}
                </summary>
                <p className="px-6 pb-5 pt-1 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                  {f.answer}
                </p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section className="card px-6 py-4 text-sm text-slate-500 flex flex-wrap gap-x-8 gap-y-1">
        {property.address && <span>📍 {property.address}</span>}
        <span>🕒 zameldowanie od {property.checkInFrom}</span>
        <span>🕚 wymeldowanie do {property.checkOutTo}</span>
        {(property.terms || property.privacyPolicy) && (
          <a
            href={`/o/${property.slug}/regulamin`}
            className="text-brand-700 font-medium hover:underline"
          >
            📄 Regulamin i polityka prywatności
          </a>
        )}
      </section>
    </div>
  );
}
