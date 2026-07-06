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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Twój plan</h1>
        <p className="text-sm text-slate-500">
          Aktualnie: <span className="font-semibold text-brand-800">{current.label}</span>{" "}
          ({current.priceZl} zł/mc) · wykorzystanie:{" "}
          <span className="font-semibold">
            {units}
            {current.maxUnits !== null ? ` / ${current.maxUnits}` : ""} jednostek
          </span>
        </p>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">✓ Plan zmieniony.</p>}

      <div className="grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = p.key === property.plan;
          const overLimit = p.maxUnits !== null && units > p.maxUnits;
          return (
            <div
              key={p.key}
              className={`card p-6 flex flex-col space-y-4 ${
                isCurrent ? "border-brand-600 border-2 shadow-md relative" : ""
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-700 text-white text-xs font-bold rounded-full px-3 py-1">
                  Twój obecny plan
                </span>
              )}
              <div>
                <h2 className="font-bold text-lg text-brand-950">{p.label}</h2>
                <p className="text-sm text-slate-500">{p.blurb}</p>
              </div>
              <p className="text-4xl font-black text-brand-950">
                {p.priceZl}
                <span className="text-base font-semibold text-slate-400"> zł/mc</span>
              </p>
              <ul className="text-sm text-slate-600 space-y-2 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span className="text-brand-600 font-bold">✓</span> {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <span className="btn-quiet w-full opacity-50 pointer-events-none">
                  Obecny plan
                </span>
              ) : (
                <form action={ownerSetPlan}>
                  <input type="hidden" name="plan" value={p.key} />
                  <button
                    type="submit"
                    className={overLimit ? "btn-quiet w-full opacity-60" : "btn-primary w-full"}
                    title={
                      overLimit
                        ? `Masz ${units} jednostek — za dużo dla tego planu`
                        : undefined
                    }
                  >
                    {overLimit
                      ? `Wymaga maks. ${p.maxUnits} jednostek`
                      : `Przejdź na ${p.label}`}
                  </button>
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
