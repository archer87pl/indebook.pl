import { Check } from "lucide-react";

export type Step = { label: string; state: "done" | "active" | "todo" };

/**
 * Stepper statusu wg 2c: ukończone #1f7a4d z ✓, aktywny ciemny z numerem
 * i poświatą 0 0 0 4px #e6f3ec, przyszłe — kreskowana obwódka.
 */
export default function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex items-center gap-0">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center">
          {i > 0 && (
            <span
              className={`mx-2 h-px w-6 sm:w-10 ${
                step.state === "todo" ? "bg-slate-200" : "bg-brand-600"
              }`}
            />
          )}
          <span className="flex items-center gap-2">
            {step.state === "done" && (
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-600 text-white">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
            {step.state === "active" && (
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-900 text-[11px] font-bold text-white shadow-[0_0_0_4px_#e6f3ec]">
                {i + 1}
              </span>
            )}
            {step.state === "todo" && (
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-dashed border-slate-300 text-[11px] font-bold text-slate-400">
                {i + 1}
              </span>
            )}
            <span
              className={`hidden text-xs sm:block ${
                step.state === "active"
                  ? "font-bold text-slate-900"
                  : step.state === "done"
                    ? "font-semibold text-brand-600"
                    : "font-medium text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
