import {
  Accessibility,
  ArrowLeft,
  Baby,
  Check,
  Coffee,
  CookingPot,
  Flame,
  Laptop,
  Mountain,
  PawPrint,
  Refrigerator,
  ShieldCheck,
  ShowerHead,
  Snowflake,
  SquareParking,
  Sun,
  Tv,
  WashingMachine,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { addDaysISO, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

const PHOTO_TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 8px,#e6ede9 8px,#e6ede9 16px)";

// ikony line-art lucide dla udogodnień (zamiast emoji z lib/amenities)
const AMENITY_ICONS: Record<string, typeof Wifi> = {
  wifi: Wifi,
  tv: Tv,
  ac: Snowflake,
  heating: Flame,
  "private-bathroom": ShowerHead,
  kitchenette: CookingPot,
  fridge: Refrigerator,
  kettle: Coffee,
  balcony: Sun,
  view: Mountain,
  parking: SquareParking,
  pets: PawPrint,
  crib: Baby,
  workspace: Laptop,
  washer: WashingMachine,
  accessible: Accessibility,
};

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

      <div className="grid gap-7 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <div>
            <h1 className="text-[26px] font-bold text-brand-950">{unitType.name}</h1>
            <p className="mt-1 text-[11.5px] text-slate-400">
              do {unitType.maxGuests} os. · {unitType.units.length}{" "}
              {unitType.units.length === 1 ? "jednostka" : "jednostki"} · min.{" "}
              {unitType.minStay} {unitType.minStay === 1 ? "noc" : "noce"}
            </p>
          </div>

          {unitType.photos.length > 0 ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={unitType.photos[0].path}
                alt={unitType.name}
                className="h-72 w-full rounded-[14px] border border-slate-200 object-cover"
              />
              {unitType.photos.length > 1 && (
                <div className="grid grid-cols-3 gap-2">
                  {unitType.photos.slice(1).map((p) => (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      key={p.id}
                      src={p.path}
                      alt=""
                      className="h-28 w-full rounded-[11px] border border-slate-200 object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex h-56 items-center justify-center rounded-[14px]"
              style={{ background: PHOTO_TEXTURE }}
            >
              <span className="tnum text-[11px] text-slate-400">zdjęcie pokoju</span>
            </div>
          )}

          {unitType.description && (
            <p className="text-[13.5px] leading-relaxed text-slate-600">
              {unitType.description}
            </p>
          )}

          {amenityDefs.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[15px] font-bold text-brand-950">Udogodnienia</h2>
              <div className="flex flex-wrap gap-2">
                {amenityDefs.map((a) => {
                  const Icon = AMENITY_ICONS[a.key] ?? Check;
                  return (
                    <span
                      key={a.key}
                      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
                    >
                      <Icon size={13} strokeWidth={2} className="text-brand-600" />
                      {a.label}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {unitType.seasons.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[15px] font-bold text-brand-950">Cennik</h2>
              <Card>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="th px-[18px] py-2.5">Sezon</th>
                      <th className="th px-3 py-2.5">Termin</th>
                      <th className="th px-[18px] py-2.5 text-right">Cena / noc</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-600">
                    <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                      <td className="px-[18px] py-2.5 font-semibold text-slate-900">
                        Cena standardowa
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">poza sezonami</td>
                      <td className="tnum px-[18px] py-2.5 text-right font-semibold text-slate-900">
                        {formatPln(unitType.basePriceGr)}
                      </td>
                    </tr>
                    {unitType.seasons.map((s, i) => (
                      <tr
                        key={s.id}
                        className={`transition-colors hover:bg-slate-50 ${
                          i < unitType.seasons.length - 1
                            ? "border-b border-slate-100"
                            : ""
                        }`}
                      >
                        <td className="px-[18px] py-2.5 font-semibold text-slate-900">
                          {s.name}
                        </td>
                        <td className="tnum px-3 py-2.5">
                          {s.startDate} – {s.endDate}
                        </td>
                        <td className="tnum px-[18px] py-2.5 text-right font-semibold text-slate-900">
                          {formatPln(s.priceGr)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </section>
          )}
        </div>

        <aside className="space-y-3 md:sticky md:top-20 md:h-fit">
          <Card className="shadow-[0_12px_30px_-16px_rgba(15,35,26,0.3)]">
            <CardBody>
              <p className="mb-3.5 flex items-baseline gap-1.5">
                <span className="tnum text-[22px] font-bold text-slate-900">
                  od {formatPln(unitType.basePriceGr)}
                </span>
                <span className="text-[13px] text-slate-400">/ noc</span>
              </p>
              <form action={`/rezerwuj/${unitType.id}`}>
                <div className="mb-3 overflow-hidden rounded-xl border border-slate-300">
                  <div className="flex">
                    <label className="flex-1 border-r border-slate-200 px-3 py-2">
                      <span className="th block">Przyjazd</span>
                      <input
                        type="date"
                        name="from"
                        required
                        min={today}
                        defaultValue={addDaysISO(today, 1)}
                        className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
                      />
                    </label>
                    <label className="flex-1 px-3 py-2">
                      <span className="th block">Wyjazd</span>
                      <input
                        type="date"
                        name="to"
                        required
                        min={addDaysISO(today, 1)}
                        defaultValue={addDaysISO(today, 1 + Math.max(1, unitType.minStay))}
                        className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
                      />
                    </label>
                  </div>
                  <label className="block border-t border-slate-200 px-3 py-2">
                    <span className="th block">Goście</span>
                    <input
                      type="number"
                      name="guests"
                      min={1}
                      max={unitType.maxGuests}
                      defaultValue={Math.min(2, unitType.maxGuests)}
                      className="mt-0.5 w-full bg-transparent text-[13px] font-semibold focus:outline-none"
                    />
                  </label>
                </div>
                <Button type="submit" size="lg" className="w-full">
                  Rezerwuj ten pokój
                </Button>
                <p className="mt-2.5 text-center text-[11px] leading-relaxed text-slate-400">
                  Dostępność sprawdzimy w następnym kroku. Zaliczka{" "}
                  {property.depositPercent}% potwierdza rezerwację.
                </p>
              </form>
            </CardBody>
          </Card>
          <div className="flex items-center gap-2.5 rounded-[11px] bg-brand-50 px-3.5 py-3">
            <ShieldCheck size={16} strokeWidth={2} className="flex-none text-brand-600" />
            <span className="text-[11.5px] leading-snug text-brand-950">
              Rezerwacja bezpośrednio u gospodarza — najlepsza cena, bez prowizji.
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
