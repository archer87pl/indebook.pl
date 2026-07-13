import {
  Accessibility,
  Baby,
  Coffee,
  CookingPot,
  Flame,
  ImagePlus,
  Laptop,
  Mountain,
  PawPrint,
  Plus,
  Refrigerator,
  ShowerHead,
  Snowflake,
  SquareParking,
  Sun,
  Trash2,
  Tv,
  WashingMachine,
  Wifi,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
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

/** Ikony lucide dla udogodnień (zamiast emoji z lib/amenities). */
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

function AmenityCheckbox({
  amenity,
  defaultChecked,
}: {
  amenity: { key: string; label: string };
  defaultChecked?: boolean;
}) {
  const Icon = AMENITY_ICONS[amenity.key];
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-slate-700">
      <input
        type="checkbox"
        name="amenities"
        value={amenity.key}
        defaultChecked={defaultChecked}
        className="accent-brand-600"
      />
      {Icon && <Icon size={13} strokeWidth={2} className="flex-none text-slate-400" />}
      {amenity.label}
    </label>
  );
}

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
    <div className="space-y-4">
      {sp.error && <p className="alert-error">{sp.error}</p>}

      {unitTypes.map((ut) => (
        <Card key={ut.id}>
          <CardHeader
            title={ut.name}
            sub={`${ut.units.length} jedn. · do ${ut.maxGuests} os. · cena bazowa ${formatPln(ut.basePriceGr)}/noc — edycja w Cenniku`}
            action={
              <form action={deleteUnitType}>
                <input type="hidden" name="id" value={ut.id} />
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-danger-600 hover:underline"
                  title="Usuń cały typ pokoju"
                >
                  <Trash2 size={13} strokeWidth={2} />
                  Usuń typ
                </button>
              </form>
            }
          />
          <CardBody className="space-y-5">
            <form action={updateUnitType} className="space-y-4 text-sm">
              <input type="hidden" name="id" value={ut.id} />
              <div className="flex flex-wrap items-end gap-3">
                <label className="label">
                  Nazwa typu
                  <input name="name" defaultValue={ut.name} required className="input w-48" />
                </label>
                <label className="label min-w-56 flex-1">
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
                <p className="th mb-2">Udogodnienia</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                  {AMENITIES.map((a) => (
                    <AmenityCheckbox
                      key={a.key}
                      amenity={a}
                      defaultChecked={parseAmenities(ut.amenities).includes(a.key)}
                    />
                  ))}
                </div>
              </div>
              <Button type="submit" size="sm">
                Zapisz zmiany
              </Button>
            </form>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="th">Jednostki ({ut.units.length})</p>
              <div className="flex flex-wrap items-center gap-2">
                {ut.units.map((u) => (
                  <div
                    key={u.id}
                    className={`flex items-center gap-2 rounded-[10px] border px-3 py-1.5 text-[12.5px] ${
                      u.active
                        ? "border-slate-200 bg-slate-50"
                        : "border-slate-300 bg-slate-100 opacity-60"
                    }`}
                  >
                    <span className="font-semibold">
                      {u.name}
                      {!u.active && (
                        <span className="ml-1 text-xs font-normal text-slate-500">(wył.)</span>
                      )}
                    </span>
                    <a
                      href={`/api/ical/${u.id}?t=${u.icalToken}`}
                      className="tnum text-[11px] font-semibold text-brand-600 hover:underline"
                      title="Eksport iCal — podepnij w Booking.com/Airbnb (zakładka Kanały)"
                    >
                      iCal
                    </a>
                    <form action={toggleUnitActive}>
                      <input type="hidden" name="id" value={u.id} />
                      <button
                        className="text-xs font-semibold text-slate-400 hover:text-brand-700"
                        title={u.active ? "Wyłącz ze sprzedaży" : "Włącz do sprzedaży"}
                      >
                        {u.active ? "wyłącz" : "włącz"}
                      </button>
                    </form>
                    {u._count.reservations === 0 && (
                      <form action={deleteUnit} className="flex">
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          className="text-danger-500 transition-colors hover:text-danger-600"
                          title="Usuń jednostkę"
                        >
                          <X size={13} strokeWidth={2.4} />
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
                  <Button type="submit" variant="quiet" size="sm">
                    <Plus size={13} strokeWidth={2.4} />
                    Dodaj
                  </Button>
                </form>
              </div>
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="th">Zdjęcia</p>
              <div className="flex flex-wrap items-center gap-3">
                {ut.photos.map((p) => (
                  <div key={p.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.path}
                      alt=""
                      className="h-20 w-28 rounded-[10px] border border-slate-200 object-cover"
                    />
                    <form action={deletePhoto} className="absolute right-1 top-1">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="back" value="pokoje" />
                      <button
                        className="flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-danger-600 shadow-sm transition-colors hover:bg-danger-100"
                        title="Usuń zdjęcie"
                      >
                        <X size={12} strokeWidth={2.4} />
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
                    className="w-52 text-xs text-slate-500"
                  />
                  <Button type="submit" variant="quiet" size="sm">
                    <ImagePlus size={13} strokeWidth={2} />
                    Dodaj
                  </Button>
                </form>
              </div>
            </div>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Nowy typ pokoju"
          sub="np. Pokój Standard, Apartament z tarasem — jednostki to konkretne pokoje w typie"
        />
        <CardBody>
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
              <p className="th mb-2">Udogodnienia</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                {AMENITIES.map((a) => (
                  <AmenityCheckbox key={a.key} amenity={a} />
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit">
                <Plus size={14} strokeWidth={2.4} />
                Dodaj typ pokoju
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
