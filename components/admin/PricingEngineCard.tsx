// Sekcja „Silnik cen" w /admin/cennik: wybór silnika (podstawowy / SmartRate),
// rynek, widełki per typ pokoju i pasek najbliższych dni z rozbiciem ceny.
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { saveRateGuards, setPricingMode } from "@/lib/actions";
import { formatPln } from "@/lib/format";
import { pricingPlanFeatures } from "@/lib/plans";
import type { Market } from "@/lib/rates/provider";

type UnitTypeRow = {
  id: number;
  name: string;
  basePriceGr: number;
  minPriceGr: number | null;
  maxPriceGr: number | null;
};

type RateRow = {
  unitTypeId: number;
  date: string;
  priceGr: number;
  clampedBy: string | null;
  demandScore: number;
  drivers: string;
  components: string;
};

export default function PricingEngineCard({
  property,
  markets,
  unitTypes,
  rates,
}: {
  property: {
    plan: string;
    pricingMode: string;
    smartRateMarketId: string;
    smartRateSyncedAt: Date | null;
    smartRateError: string;
  };
  markets: Market[];
  unitTypes: UnitTypeRow[];
  rates: RateRow[];
}) {
  const allowed = pricingPlanFeatures(property.plan).smartRate;
  const on = property.pricingMode === "SMARTRATE";

  if (!allowed) {
    return (
      <Card>
        <CardHeader title="Silnik cen" sub="Ceny dynamiczne SmartRate" />
        <CardBody className="space-y-3 text-sm text-slate-600">
          <p>
            SmartRate liczy cenę każdej doby z sezonowości, dnia tygodnia, wyprzedzenia,
            obłożenia rynku i popytu — i pokazuje, który mnożnik ile dołożył.
          </p>
          <Button href="/admin/plan" variant="quiet">
            Zobacz plany od Pro
          </Button>
        </CardBody>
      </Card>
    );
  }

  const byVoivodeship = new Map<string, Market[]>();
  for (const m of markets) {
    const list = byVoivodeship.get(m.voivodeship) ?? [];
    list.push(m);
    byVoivodeship.set(m.voivodeship, list);
  }

  return (
    <Card>
      <CardHeader
        title="Silnik cen"
        sub={on ? "SmartRate (ceny dynamiczne)" : "Podstawowy (reguły poniżej)"}
      />
      <CardBody className="space-y-5">
        {property.smartRateError && (
          <p className="alert-error">
            SmartRate zgłosił błąd: {property.smartRateError}. Do czasu naprawy ceny
            liczą się z reguł poniżej.
          </p>
        )}

        <form action={setPricingMode} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="label">
            Silnik
            <select
              name="pricingMode"
              defaultValue={property.pricingMode}
              className="input w-52"
            >
              <option value="BASIC">Podstawowy (reguły)</option>
              <option value="SMARTRATE">SmartRate</option>
            </select>
          </label>
          <label className="label">
            Rynek
            <select
              name="smartRateMarketId"
              defaultValue={property.smartRateMarketId}
              className="input w-64"
            >
              <option value="">— wybierz —</option>
              {[...byVoivodeship.entries()].map(([voivodeship, list]) => (
                <optgroup key={voivodeship} label={voivodeship}>
                  {list.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Button type="submit">Zapisz silnik</Button>
          {property.smartRateSyncedAt && (
            <span className="text-[12px] text-slate-400">
              Ostatnie pobranie:{" "}
              {property.smartRateSyncedAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          )}
        </form>

        {on &&
          unitTypes.map((ut) => {
            const days = rates
              .filter((r) => r.unitTypeId === ut.id)
              .sort((a, b) => a.date.localeCompare(b.date))
              .slice(0, 30);
            return (
              <div key={ut.id} className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-[13px] font-bold text-brand-950">{ut.name}</p>
                <form
                  action={saveRateGuards}
                  className="flex flex-wrap items-end gap-3 text-sm"
                >
                  <input type="hidden" name="unitTypeId" value={ut.id} />
                  <label className="label">
                    Cena min. / noc (zł)
                    <input
                      name="minPriceZl"
                      defaultValue={((ut.minPriceGr ?? 0) / 100)
                        .toString()
                        .replace(".", ",")}
                      className="input tnum w-32"
                    />
                  </label>
                  <label className="label">
                    Cena maks. / noc (zł)
                    <input
                      name="maxPriceZl"
                      defaultValue={((ut.maxPriceGr ?? 0) / 100)
                        .toString()
                        .replace(".", ",")}
                      className="input tnum w-32"
                    />
                  </label>
                  <Button type="submit" variant="quiet">
                    Zapisz widełki
                  </Button>
                </form>

                {days.length === 0 ? (
                  <p className="text-[12px] text-slate-400">
                    Rekomendacje pobiorą się w tle — odśwież stronę za chwilę.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead className="text-left text-slate-400">
                        <tr>
                          <th className="py-1 pr-3 font-semibold">Data</th>
                          <th className="py-1 pr-3 font-semibold">Cena</th>
                          <th className="py-1 pr-3 font-semibold">Popyt</th>
                          <th className="py-1 font-semibold">Dlaczego</th>
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((d) => {
                          const c = JSON.parse(d.components) as Record<string, number>;
                          const drivers = JSON.parse(d.drivers) as string[];
                          const factors = [
                            ["sezon", c.season],
                            ["dzień tyg.", c.dayOfWeek],
                            ["wyprzedzenie", c.leadTime],
                            ["obłożenie", c.occupancy],
                            ["popyt", c.demand],
                          ] as const;
                          return (
                            <tr key={d.date} className="border-t border-slate-100">
                              <td className="tnum py-1 pr-3">{d.date}</td>
                              <td className="tnum py-1 pr-3 font-bold">
                                {formatPln(d.priceGr)}
                                {d.clampedBy && (
                                  <Badge tone="warning">
                                    {d.clampedBy === "max"
                                      ? "obcięte do maks."
                                      : "podbite do min."}
                                  </Badge>
                                )}
                              </td>
                              <td className="tnum py-1 pr-3">{d.demandScore}</td>
                              <td className="py-1 text-slate-500">
                                {factors
                                  .filter(([, v]) => typeof v === "number" && v !== 1)
                                  .map(([label, v]) => `${label} ×${v.toFixed(2)}`)
                                  .join(" · ")}
                                {drivers.length > 0 && ` — ${drivers.join(", ")}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
      </CardBody>
    </Card>
  );
}
