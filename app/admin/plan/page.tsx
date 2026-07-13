import { Check } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ownerSetPlan } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PLANS, planDef } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function PlanPage(props: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const units = await prisma.unit.count({
    where: { unitType: { propertyId: property.id } },
  });
  const current = planDef(property.plan);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[15px] font-bold">Twój abonament</p>
        <p className="text-[12.5px] text-slate-500">
          Aktualnie:{" "}
          <span className="font-semibold text-brand-700">{current.label}</span>{" "}
          (<span className="nums">{current.priceZl}</span> zł/mc) · wykorzystanie:{" "}
          <span className="nums font-semibold text-slate-900">
            {units}
            {current.maxUnits !== null ? ` / ${current.maxUnits}` : ""}
          </span>{" "}
          jednostek
        </p>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">Plan zmieniony.</p>}

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.key === property.plan;
          const overLimit = p.maxUnits !== null && units > p.maxUnits;
          return (
            <div
              key={p.key}
              className={`relative flex flex-col space-y-4 rounded-[14px] border p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${
                isCurrent
                  ? "border-brand-600 bg-brand-50"
                  : "border-slate-200 bg-white"
              }`}
            >
              {isCurrent && (
                <Badge
                  tone="dark"
                  className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1"
                >
                  Twój obecny plan
                </Badge>
              )}
              <div>
                <h2 className="text-[15px] font-bold text-brand-950">{p.label}</h2>
                <p className="text-[12.5px] text-slate-500">{p.blurb}</p>
              </div>
              <p className="nums text-4xl font-bold tracking-[-0.02em] text-brand-950">
                {p.priceZl}
                <span className="text-base font-semibold text-slate-400"> zł/mc</span>
              </p>
              <ul className="flex-1 space-y-2 text-[12.5px] text-slate-600">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      className="mt-0.5 flex-none text-brand-600"
                    />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="btn-quiet pointer-events-none w-full opacity-50">
                  Obecny plan
                </span>
              ) : (
                <form action={ownerSetPlan}>
                  <input type="hidden" name="plan" value={p.key} />
                  <Button
                    type="submit"
                    variant={overLimit ? "quiet" : "primary"}
                    className={`w-full ${overLimit ? "opacity-60" : ""}`}
                    title={
                      overLimit
                        ? `Masz ${units} jednostek — za dużo dla tego planu`
                        : undefined
                    }
                  >
                    {overLimit
                      ? `Wymaga maks. ${p.maxUnits} jednostek`
                      : `Przejdź na ${p.label}`}
                  </Button>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">
        Zmiana planu działa od razu. Rozliczanie abonamentu (faktury, płatność
        cykliczna) pojawi się przy starcie produkcyjnym — do tego czasu zmiany planów są
        bezpłatne.
      </p>
    </div>
  );
}
