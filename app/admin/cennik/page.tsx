import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import Toggle from "@/components/ui/Toggle";
import {
  adminAddSeason,
  adminDeleteSeason,
  adminUpdatePricing,
  createPromoCode,
  deletePromoCode,
  savePricingRule,
  togglePromoCode,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PRICING_RULE_KINDS } from "@/lib/dynamic-pricing";
import { formatPln } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const { property } = await requireOwner();
  const [promoCodes, pricingRules, unitTypes] = await prisma.$transaction([
    prisma.promoCode.findMany({
      where: { propertyId: property.id },
      orderBy: { id: "desc" },
    }),
    prisma.pricingRule.findMany({ where: { propertyId: property.id } }),
    prisma.unitType.findMany({
      where: { propertyId: property.id },
      include: { seasons: { orderBy: { startDate: "asc" } }, units: true },
      orderBy: { id: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      {unitTypes.map((ut) => (
        <Card key={ut.id}>
          <CardHeader
            title={ut.name}
            sub={`${ut.units.length} jedn. · do ${ut.maxGuests} os.`}
          />
          <CardBody className="space-y-5">
            <form action={adminUpdatePricing} className="flex flex-wrap items-end gap-3 text-sm">
              <input type="hidden" name="unitTypeId" value={ut.id} />
              <label className="label">
                Cena bazowa / noc (zł)
                <input
                  name="basePriceZl"
                  defaultValue={(ut.basePriceGr / 100).toString().replace(".", ",")}
                  className="input tnum w-36"
                />
              </label>
              <label className="label">
                Min. pobyt (noce)
                <input
                  type="number"
                  name="minStay"
                  min={1}
                  defaultValue={ut.minStay}
                  className="input w-28"
                />
              </label>
              <Button type="submit" size="sm" className="mb-0.5">
                Zapisz
              </Button>
            </form>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="th">Sezony (cena nadpisuje bazową)</p>
              {ut.seasons.map((s) => (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-[12.5px]"
                >
                  <span className="text-slate-600">
                    <span className="font-semibold text-slate-900">{s.name}</span>{" "}
                    <span className="tnum text-xs">
                      · {s.startDate} → {s.endDate}
                    </span>{" "}
                    · <span className="tnum font-semibold text-slate-900">{formatPln(s.priceGr)}</span>
                    /noc · min. {s.minStay} noc(e)
                  </span>
                  <form action={adminDeleteSeason}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="flex items-center gap-1 text-xs font-semibold text-danger-600 hover:underline">
                      <Trash2 size={12} strokeWidth={2} />
                      Usuń
                    </button>
                  </form>
                </div>
              ))}
              {ut.seasons.length === 0 && (
                <p className="text-[12.5px] text-slate-400">
                  Brak sezonów — obowiązuje cena bazowa.
                </p>
              )}
            </div>

            <form
              action={adminAddSeason}
              className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 text-sm"
            >
              <input type="hidden" name="unitTypeId" value={ut.id} />
              <label className="label">
                Nazwa sezonu
                <input name="name" required placeholder="np. Wakacje" className="input w-36" />
              </label>
              <label className="label">
                Od (pierwsza noc)
                <input type="date" name="startDate" required className="input" />
              </label>
              <label className="label">
                Do (ostatnia noc)
                <input type="date" name="endDate" required className="input" />
              </label>
              <label className="label">
                Cena / noc (zł)
                <input name="priceZl" required className="input tnum w-28" />
              </label>
              <label className="label">
                Min. pobyt
                <input type="number" name="minStay" min={1} defaultValue={1} className="input w-24" />
              </label>
              <Button type="submit" variant="quiet" size="sm" className="mb-0.5">
                <Plus size={13} strokeWidth={2.4} />
                Dodaj sezon
              </Button>
            </form>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Ceny dynamiczne"
          sub="Automatyczne korekty cen za noc, nakładane na cennik (bazę/sezony). Dodatnia korekta = podwyżka, ujemna = rabat. Korekty z kilku reguł sumują się."
        />
        <CardBody className="space-y-3">
          {PRICING_RULE_KINDS.map((kind) => {
            const rule = pricingRules.find((r) => r.kind === kind.key);
            return (
              <form
                key={kind.key}
                action={savePricingRule}
                className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-[10px] border border-slate-100 bg-slate-50 px-3.5 py-3 text-sm"
              >
                <input type="hidden" name="kind" value={kind.key} />
                <div className="w-44 self-center">
                  <p className="text-[13px] font-bold">{kind.label}</p>
                  <p className="text-[11px] leading-snug text-slate-500">{kind.hint}</p>
                </div>
                <label className="label">
                  Korekta ceny (%)
                  <input
                    type="number"
                    name="percent"
                    required
                    min={-50}
                    max={100}
                    defaultValue={rule?.percent ?? kind.defaultPercent}
                    className="input tnum w-28"
                  />
                </label>
                {kind.paramLabel && (
                  <label className="label">
                    {kind.paramLabel}
                    <input
                      type="number"
                      name="param"
                      required
                      min={1}
                      max={kind.key === "OCCUPANCY" ? 100 : 60}
                      defaultValue={rule?.param || kind.defaultParam}
                      className="input tnum w-32"
                    />
                  </label>
                )}
                <div className="pb-2">
                  <Toggle name="active" defaultChecked={rule?.active ?? false} label="aktywna" />
                </div>
                <Button type="submit" size="sm" className="mb-0.5">
                  Zapisz
                </Button>
              </form>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Kody promocyjne"
          sub="Gość wpisuje kod w formularzu rezerwacji — rabat % od kwoty pobytu."
        />
        <CardBody className="space-y-3">
          {promoCodes.map((p) => (
            <div
              key={p.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-slate-100 px-3.5 py-2.5 text-[12.5px] ${
                p.active ? "bg-slate-50" : "bg-slate-100 opacity-60"
              }`}
            >
              <span className="text-slate-600">
                <span className="tnum font-bold text-slate-900">{p.code}</span> ·{" "}
                <span className="tnum font-semibold text-brand-600">−{p.percentOff}%</span>
                {(p.validFrom || p.validTo) && (
                  <span className="tnum text-xs text-slate-400">
                    {" "}
                    · {p.validFrom || "…"} → {p.validTo || "…"}
                  </span>
                )}
                <span className="text-slate-400">
                  {" "}
                  · użycia:{" "}
                  <span className="tnum">
                    {p.usedCount}
                    {p.maxUses > 0 ? `/${p.maxUses}` : ""}
                  </span>
                </span>
                {!p.active && <span className="text-slate-500"> · wyłączony</span>}
              </span>
              <span className="flex items-center gap-3">
                <form action={togglePromoCode}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs font-semibold text-slate-500 hover:text-brand-700">
                    {p.active ? "Wyłącz" : "Włącz"}
                  </button>
                </form>
                <form action={deletePromoCode}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="flex items-center gap-1 text-xs font-semibold text-danger-600 hover:underline">
                    <Trash2 size={12} strokeWidth={2} />
                    Usuń
                  </button>
                </form>
              </span>
            </div>
          ))}
          {promoCodes.length === 0 && (
            <p className="text-[12.5px] text-slate-400">Brak kodów promocyjnych.</p>
          )}

          <form
            action={createPromoCode}
            className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4 text-sm"
          >
            <label className="label">
              Kod
              <input
                name="code"
                required
                placeholder="np. LATO10"
                className="input tnum w-32 uppercase"
              />
            </label>
            <label className="label">
              Rabat (%)
              <input
                type="number"
                name="percentOff"
                required
                min={1}
                max={90}
                defaultValue={10}
                className="input tnum w-24"
              />
            </label>
            <label className="label">
              Ważny od
              <input type="date" name="validFrom" className="input" />
            </label>
            <label className="label">
              Ważny do
              <input type="date" name="validTo" className="input" />
            </label>
            <label className="label">
              Limit użyć (0 = brak)
              <input
                type="number"
                name="maxUses"
                min={0}
                defaultValue={0}
                className="input tnum w-28"
              />
            </label>
            <Button type="submit" variant="quiet" size="sm" className="mb-0.5">
              <Plus size={13} strokeWidth={2.4} />
              Dodaj kod
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
