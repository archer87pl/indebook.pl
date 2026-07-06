import {
  addUnit,
  createUnitType,
  deletePhoto,
  deleteUnit,
  deleteUnitType,
  toggleUnitActive,
  updateUnitType,
  uploadUnitTypePhoto,
} from "@/lib/actions";
import { AMENITIES, parseAmenities } from "@/lib/amenities";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RoomsPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const unitTypes = await prisma.unitType.findMany({
    where: { propertyId: property.id },
    include: {
      units: { orderBy: { id: "asc" }, include: { _count: { select: { reservations: true } } } },
      photos: { orderBy: { id: "asc" } },
    },
    orderBy: { id: "asc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Pokoje</h1>
      {sp.error && <p className="alert-error">{sp.error}</p>}

      {unitTypes.map((ut) => (
        <div key={ut.id} className="card p-6 space-y-4">
          <form action={updateUnitType} className="space-y-3 text-sm">
            <input type="hidden" name="id" value={ut.id} />
            <div className="flex flex-wrap items-end gap-3">
              <label className="label">
                Nazwa typu
                <input name="name" defaultValue={ut.name} required className="input w-48" />
              </label>
              <label className="label flex-1 min-w-56">
                Opis
                <input name="description" defaultValue={ut.description} className="input w-full" />
              </label>
              <label className="label">
                Maks. gości
                <input
                  type="number"
                  name="maxGuests"
                  min={1}
                  max={30}
                  defaultValue={ut.maxGuests}
                  className="input w-24"
                />
              </label>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1.5">Udogodnienia</p>
              <div className="grid gap-x-4 gap-y-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {AMENITIES.map((a) => (
                  <label key={a.key} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="amenities"
                      value={a.key}
                      defaultChecked={parseAmenities(ut.amenities).includes(a.key)}
                      className="accent-teal-700"
                    />
                    {a.icon} {a.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg px-4 py-2">
                Zapisz
              </button>
              <span className="text-xs text-slate-400">
                cena bazowa {formatPln(ut.basePriceGr)}/noc — edycja w Cenniku
              </span>
            </div>
          </form>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-500">
              Jednostki ({ut.units.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {ut.units.map((u) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 text-sm ${
                    u.active
                      ? "bg-slate-50 border-slate-200"
                      : "bg-slate-100 border-slate-300 opacity-60"
                  }`}
                >
                  <span className="font-medium">
                    {u.name}
                    {!u.active && (
                      <span className="ml-1 text-xs text-slate-500">(wył.)</span>
                    )}
                  </span>
                  <a
                    href={`/api/ical/${u.id}?t=${u.icalToken}`}
                    className="text-brand-700 text-xs hover:underline"
                    title="Eksport iCal — podepnij w Booking.com/Airbnb (zakładka Kanały)"
                  >
                    iCal
                  </a>
                  <form action={toggleUnitActive}>
                    <input type="hidden" name="id" value={u.id} />
                    <button
                      className="text-slate-400 hover:text-brand-700 text-xs"
                      title={u.active ? "Wyłącz ze sprzedaży" : "Włącz do sprzedaży"}
                    >
                      {u.active ? "wyłącz" : "włącz"}
                    </button>
                  </form>
                  {u._count.reservations === 0 && (
                    <form action={deleteUnit}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-red-500 hover:text-red-700" title="Usuń jednostkę">
                        ✕
                      </button>
                    </form>
                  )}
                </div>
              ))}
              <form action={addUnit} className="flex items-center gap-2">
                <input type="hidden" name="unitTypeId" value={ut.id} />
                <input
                  name="name"
                  required
                  placeholder="nr / nazwa"
                  className="input w-28 py-1.5 text-sm"
                />
                <button className="btn-quiet py-1.5 text-sm">+ Dodaj</button>
              </form>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-500">Zdjęcia</h3>
            <div className="flex flex-wrap items-center gap-3">
              {ut.photos.map((p) => (
                <div key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.path}
                    alt=""
                    className="h-20 w-28 object-cover rounded-lg border border-slate-200"
                  />
                  <form action={deletePhoto} className="absolute top-1 right-1">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="back" value="pokoje" />
                    <button
                      className="bg-white/90 hover:bg-red-50 text-red-600 rounded px-1.5 text-xs font-bold"
                      title="Usuń zdjęcie"
                    >
                      ✕
                    </button>
                  </form>
                </div>
              ))}
              <form action={uploadUnitTypePhoto} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="unitTypeId" value={ut.id} />
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-xs w-52"
                />
                <button className="btn-quiet py-1.5 text-xs">Dodaj</button>
              </form>
            </div>
          </div>

          <form action={deleteUnitType} className="text-right">
            <input type="hidden" name="id" value={ut.id} />
            <button className="text-xs text-red-500 hover:underline">
              Usuń cały typ pokoju
            </button>
          </form>
        </div>
      ))}

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg text-brand-950">+ Nowy typ pokoju</h2>
        <form action={createUnitType} className="grid gap-4 sm:grid-cols-2">
          <label className="label">
            Nazwa *
            <input name="name" required placeholder="np. Pokój Standard" className="input" />
          </label>
          <label className="label">
            Opis
            <input name="description" placeholder="np. Widok na jezioro, balkon" className="input" />
          </label>
          <label className="label">
            Maks. gości *
            <input type="number" name="maxGuests" min={1} max={30} defaultValue={2} className="input" />
          </label>
          <label className="label">
            Cena bazowa / noc (zł) *
            <input name="basePriceZl" required placeholder="np. 250" className="input" />
          </label>
          <label className="label">
            Min. pobyt (noce)
            <input type="number" name="minStay" min={1} defaultValue={1} className="input" />
          </label>
          <label className="label">
            Liczba jednostek *
            <input type="number" name="unitsCount" min={1} max={50} defaultValue={1} className="input" />
          </label>
          <div className="sm:col-span-2">
            <p className="text-sm font-semibold text-slate-500 mb-1.5">Udogodnienia</p>
            <div className="grid gap-x-4 gap-y-1.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {AMENITIES.map((a) => (
                <label key={a.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="amenities" value={a.key} className="accent-teal-700" />
                  {a.icon} {a.label}
                </label>
              ))}
            </div>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary">
              Dodaj typ pokoju
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
