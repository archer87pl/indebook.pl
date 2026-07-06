import {
  adminAddSeason,
  adminDeleteSeason,
  adminUpdatePricing,
  createPromoCode,
  deletePromoCode,
  togglePromoCode,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PricingPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const promoCodes = await prisma.promoCode.findMany({
    where: { propertyId: property.id },
    orderBy: { id: "desc" },
  });
  const unitTypes = await prisma.unitType.findMany({
    where: { propertyId: property.id },
    include: { seasons: { orderBy: { startDate: "asc" } }, units: true },
    orderBy: { id: "asc" },
  });
  const input = "border border-slate-300 rounded-lg px-3 py-2";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Cennik</h1>
      {sp.error && (
        <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
          {sp.error}
        </p>
      )}

      {unitTypes.map((ut) => (
        <div key={ut.id} className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-lg">
              {ut.name}{" "}
              <span className="text-sm text-slate-400 font-normal">
                · {ut.units.length} jedn. · do {ut.maxGuests} os.
              </span>
            </h2>
          </div>

          <form action={adminUpdatePricing} className="flex flex-wrap items-end gap-3 text-sm">
            <input type="hidden" name="unitTypeId" value={ut.id} />
            <label className="flex flex-col gap-1 font-medium">
              Cena bazowa / noc (zł)
              <input
                name="basePriceZl"
                defaultValue={(ut.basePriceGr / 100).toString().replace(".", ",")}
                className={`${input} w-36`}
              />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Min. pobyt (noce)
              <input
                type="number"
                name="minStay"
                min={1}
                defaultValue={ut.minStay}
                className={`${input} w-28`}
              />
            </label>
            <button className="bg-slate-700 hover:bg-slate-800 text-white font-semibold rounded-lg px-4 py-2">
              Zapisz
            </button>
          </form>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-500">Sezony (cena nadpisuje bazową)</h3>
            {ut.seasons.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2"
              >
                <span>
                  <span className="font-medium">{s.name}</span> · {s.startDate} → {s.endDate} ·{" "}
                  {formatPln(s.priceGr)}/noc · min. {s.minStay} noc(e)
                </span>
                <form action={adminDeleteSeason}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-red-600 hover:underline">Usuń</button>
                </form>
              </div>
            ))}
            {ut.seasons.length === 0 && (
              <p className="text-sm text-slate-400">Brak sezonów — obowiązuje cena bazowa.</p>
            )}
          </div>

          <form action={adminAddSeason} className="flex flex-wrap items-end gap-3 text-sm border-t border-slate-100 pt-4">
            <input type="hidden" name="unitTypeId" value={ut.id} />
            <label className="flex flex-col gap-1 font-medium">
              Nazwa sezonu
              <input name="name" required placeholder="np. Wakacje" className={`${input} w-36`} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Od (pierwsza noc)
              <input type="date" name="startDate" required className={input} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Do (ostatnia noc)
              <input type="date" name="endDate" required className={input} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Cena / noc (zł)
              <input name="priceZl" required className={`${input} w-28`} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Min. pobyt
              <input type="number" name="minStay" min={1} defaultValue={1} className={`${input} w-24`} />
            </label>
            <button className="bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-4 py-2">
              Dodaj sezon
            </button>
          </form>
        </div>
      ))}

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div>
          <h2 className="font-bold text-lg text-brand-950">Kody promocyjne</h2>
          <p className="text-xs text-slate-500">
            Gość wpisuje kod w formularzu rezerwacji — rabat % od kwoty pobytu.
          </p>
        </div>

        {promoCodes.map((p) => (
          <div
            key={p.id}
            className={`flex flex-wrap items-center justify-between gap-2 text-sm rounded-lg px-3 py-2 ${
              p.active ? "bg-slate-50" : "bg-slate-100 opacity-60"
            }`}
          >
            <span>
              <span className="font-mono font-bold">{p.code}</span> · −{p.percentOff}%
              {(p.validFrom || p.validTo) && (
                <span className="text-slate-400">
                  {" "}
                  · {p.validFrom || "…"} → {p.validTo || "…"}
                </span>
              )}
              <span className="text-slate-400">
                {" "}
                · użycia: {p.usedCount}
                {p.maxUses > 0 ? `/${p.maxUses}` : ""}
              </span>
              {!p.active && <span className="text-slate-500"> · wyłączony</span>}
            </span>
            <span className="flex gap-3">
              <form action={togglePromoCode}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-slate-500 hover:text-brand-700">
                  {p.active ? "Wyłącz" : "Włącz"}
                </button>
              </form>
              <form action={deletePromoCode}>
                <input type="hidden" name="id" value={p.id} />
                <button className="text-red-600 hover:underline">Usuń</button>
              </form>
            </span>
          </div>
        ))}
        {promoCodes.length === 0 && (
          <p className="text-sm text-slate-400">Brak kodów promocyjnych.</p>
        )}

        <form action={createPromoCode} className="flex flex-wrap items-end gap-3 text-sm border-t border-slate-100 pt-4">
          <label className="flex flex-col gap-1 font-medium">
            Kod
            <input
              name="code"
              required
              placeholder="np. LATO10"
              className="border border-slate-300 rounded-lg px-3 py-2 w-32 uppercase font-mono"
            />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Rabat (%)
            <input
              type="number"
              name="percentOff"
              required
              min={1}
              max={90}
              defaultValue={10}
              className="border border-slate-300 rounded-lg px-3 py-2 w-24"
            />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Ważny od
            <input type="date" name="validFrom" className="border border-slate-300 rounded-lg px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Ważny do
            <input type="date" name="validTo" className="border border-slate-300 rounded-lg px-3 py-2" />
          </label>
          <label className="flex flex-col gap-1 font-medium">
            Limit użyć (0 = brak)
            <input
              type="number"
              name="maxUses"
              min={0}
              defaultValue={0}
              className="border border-slate-300 rounded-lg px-3 py-2 w-28"
            />
          </label>
          <button className="bg-brand-700 hover:bg-brand-800 text-white font-semibold rounded-lg px-4 py-2">
            Dodaj kod
          </button>
        </form>
      </div>
    </div>
  );
}
