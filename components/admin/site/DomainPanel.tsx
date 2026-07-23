// Panel własnej domeny (plan PRO) — server component.
// Ukryty, gdy instalacja nie ma skonfigurowanego DomainProvidera.

import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import type { Site } from "@prisma/client";
import SubmitButton from "@/components/ui/SubmitButton";
import { domainProvider, type DomainCheck } from "@/lib/domains";
import { sitePlanFeatures } from "@/lib/plans";
import {
  refreshDomainStatus,
  removeCustomDomain,
  setCustomDomain,
} from "@/lib/site-actions";

function StatusBadge({ status }: { status: string }) {
  if (status === "VERIFIED") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
        <CheckCircle2 size={13} /> Zweryfikowana
      </span>
    );
  }
  if (status === "ERROR") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
        <CircleAlert size={13} /> Błąd
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">
      <Clock3 size={13} /> Oczekuje na DNS
    </span>
  );
}

export default async function DomainPanel({ site, plan }: { site: Site; plan: string }) {
  const provider = domainProvider();
  if (!provider) return null;

  if (!sitePlanFeatures(plan).customDomain) {
    return (
      <div className="rounded-[11px] bg-slate-50 px-4 py-3 text-[12.5px] text-slate-500">
        <b>Własna domena</b> (np. mojobiekt.pl) jest dostępna w planie <b>Pro</b>.
      </div>
    );
  }

  if (!site.customDomain) {
    return (
      <div className="space-y-2 border-t border-slate-100 pt-3">
        <p className="text-[13px] font-semibold">Własna domena</p>
        <p className="text-xs text-slate-400">
          Masz już domenę (np. mojobiekt.pl)? Podepnij ją — pokażemy Ci, jakie rekordy DNS
          wpisać u rejestratora. SSL wystawi się automatycznie.
        </p>
        <form action={setCustomDomain} className="flex flex-wrap items-center gap-2">
          <input
            name="domain"
            placeholder="mojobiekt.pl"
            className="min-w-0 flex-1 rounded-[11px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
            aria-label="Domena"
          />
          <SubmitButton className="rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950">
            Podepnij
          </SubmitButton>
        </form>
      </div>
    );
  }

  let check: DomainCheck | null = null;
  try {
    check = await provider.check(site.customDomain);
  } catch {
    check = null;
  }

  return (
    <div className="space-y-3 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-semibold">
          Własna domena: <span className="font-bold">{site.customDomain}</span>
        </p>
        <StatusBadge status={check?.status ?? site.domainStatus} />
      </div>
      {check && check.status !== "VERIFIED" && (
        <>
          <p className="text-xs leading-relaxed text-slate-500">{check.message}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 pr-3 font-semibold">Typ</th>
                  <th className="py-1 pr-3 font-semibold">Nazwa (host)</th>
                  <th className="py-1 font-semibold">Wartość</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {check.records.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">{r.type}</td>
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="break-all py-1.5">{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ol className="list-inside list-decimal space-y-0.5 text-xs text-slate-400">
            <li>Zaloguj się do panelu rejestratora domeny (np. OVH, home.pl, nazwa.pl).</li>
            <li>W ustawieniach DNS dodaj rekordy z tabeli powyżej.</li>
            <li>Wróć tu i kliknij „Odśwież status” — propagacja trwa zwykle do godziny.</li>
          </ol>
        </>
      )}
      {check?.status === "VERIFIED" && (
        <p className="text-xs text-slate-500">{check.message}</p>
      )}
      <div className="flex gap-2">
        <form action={refreshDomainStatus}>
          <SubmitButton className="rounded-[9px] border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-600">
            Odśwież status
          </SubmitButton>
        </form>
        <form action={removeCustomDomain}>
          <SubmitButton className="rounded-[9px] border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-red-400 hover:text-red-600">
            Odepnij domenę
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
