import Link from "next/link";
import { notFound } from "next/navigation";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RoomPage(props: {
  params: Promise<{ slug: string; unitTypeId: string }>;
}) {
  const { slug, unitTypeId } = await props.params;
  const unitType = await prisma.unitType.findUnique({
    where: { id: Number(unitTypeId) },
    include: {
      property: true,
      photos: { orderBy: { id: "asc" } },
      units: { where: { active: true } },
      seasons: { orderBy: { startDate: "asc" } },
    },
  });
  if (!unitType || unitType.property.slug !== slug) notFound();

  const property = unitType.property;
  const amenities = parseAmenities(unitType.amenities);
  const amenityDefs = AMENITIES.filter((a) => amenities.includes(a.key));
  const today = todayISO();

  return (
    <div className="space-y-8">
      <p className="text-sm">
        <Link href={`/o/${property.slug}`} className="text-brand-700 hover:underline">
          ← {property.name}
        </Link>
      </p>

      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-brand-950">{unitType.name}</h1>
            <p className="mt-1 text-sm font-medium text-slate-500 uppercase tracking-wide">
              do {unitType.maxGuests} os. · {unitType.units.length}{" "}
              {unitType.units.length === 1 ? "jednostka" : "jednostki"} · min.{" "}
              {unitType.minStay} {unitType.minStay === 1 ? "noc" : "noce"}
            </p>
          </div>

          {unitType.photos.length > 0 ? (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={unitType.photos[0].path}
                alt={unitType.name}
                className="w-full h-72 object-cover rounded-2xl border border-slate-200"
              />
              {unitType.photos.length > 1 && (
                <div className="grid gap-3 grid-cols-3">
                  {unitType.photos.slice(1).map((p) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={p.id}
                      src={p.path}
                      alt=""
                      className="h-28 w-full object-cover rounded-xl border border-slate-200"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="h-48 grid place-items-center text-6xl rounded-2xl bg-gradient-to-br from-brand-100 via-brand-50 to-accent-100">
              🛏️
            </div>
          )}

          {unitType.description && (
            <p className="text-slate-600 leading-relaxed">{unitType.description}</p>
          )}

          {amenityDefs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-brand-950">Udogodnienia</h2>
              <div className="grid gap-x-6 gap-y-2 grid-cols-2 sm:grid-cols-3">
                {amenityDefs.map((a) => (
                  <p key={a.key} className="text-sm text-slate-700">
                    {a.icon} {a.label}
                  </p>
                ))}
              </div>
            </section>
          )}

          {unitType.seasons.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-bold text-brand-950">Cennik</h2>
              <div className="card divide-y divide-slate-100 text-sm">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-slate-600">Cena standardowa</span>
                  <span className="font-semibold">{formatPln(unitType.basePriceGr)} / noc</span>
                </div>
                {unitType.seasons.map((s) => (
                  <div key={s.id} className="flex justify-between px-4 py-2.5">
                    <span className="text-slate-600">
                      {s.name} ({s.startDate} → {s.endDate})
                    </span>
                    <span className="font-semibold">{formatPln(s.priceGr)} / noc</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="card p-6 h-fit space-y-4 md:sticky md:top-20">
          <p>
            <span className="text-3xl font-black text-brand-700">
              od {formatPln(unitType.basePriceGr)}
            </span>{" "}
            <span className="text-sm text-slate-400">/ noc</span>
          </p>
          <form action={`/rezerwuj/${unitType.id}`} className="space-y-3">
            <label className="label">
              Przyjazd
              <input
                type="date"
                name="from"
                required
                min={today}
                defaultValue={addDaysISO(today, 1)}
                className="input w-full"
              />
            </label>
            <label className="label">
              Wyjazd
              <input
                type="date"
                name="to"
                required
                min={addDaysISO(today, 1)}
                defaultValue={addDaysISO(today, 1 + Math.max(1, unitType.minStay))}
                className="input w-full"
              />
            </label>
            <label className="label">
              Goście
              <input
                type="number"
                name="guests"
                min={1}
                max={unitType.maxGuests}
                defaultValue={Math.min(2, unitType.maxGuests)}
                className="input w-full"
              />
            </label>
            <button type="submit" className="btn-accent w-full py-3">
              Rezerwuj ten pokój
            </button>
            <p className="text-xs text-slate-400 text-center">
              Dostępność sprawdzimy w następnym kroku. Zaliczka{" "}
              {property.depositPercent}% potwierdza rezerwację.
            </p>
          </form>
        </aside>
      </div>
    </div>
  );
}
