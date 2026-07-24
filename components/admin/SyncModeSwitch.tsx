"use client";

// Segmentowy przełącznik trybu synchronizacji kanałów obiektu.
import SubmitButton from "@/components/ui/SubmitButton";
import { setSyncMode } from "@/lib/channex/sync-actions";

const OPTS = [
  { value: "OFF", label: "Bez synchronizacji" },
  { value: "ICAL", label: "iCal" },
  { value: "CHANNEX", label: "Channex (2-way)" },
] as const;

export default function SyncModeSwitch({
  mode,
  channexEnabled,
}: {
  mode: string;
  channexEnabled: boolean;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-[12px] border border-slate-200 bg-white p-1">
      {OPTS.map((o) => {
        const active = o.value === mode;
        const disabled = o.value === "CHANNEX" && !channexEnabled;
        return (
          <form key={o.value} action={setSyncMode}>
            <input type="hidden" name="mode" value={o.value} />
            <SubmitButton
              disabled={disabled || active}
              title={disabled ? "Dostępne w planie Pro po włączeniu integracji Channex" : undefined}
              className={`rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                active
                  ? "bg-brand-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
              }`}
            >
              {o.label}
            </SubmitButton>
          </form>
        );
      })}
    </div>
  );
}
