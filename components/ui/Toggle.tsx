/**
 * Przełącznik wg 1c: on = tło #1f7a4d, gałka po prawej; off = #d5ddd8, gałka po lewej.
 * Czysty CSS (checkbox + peer) — działa w formularzach serwerowych bez JS.
 */
export default function Toggle({
  name,
  defaultChecked,
  label,
  hint,
  disabled,
}: {
  name: string;
  defaultChecked?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        disabled={disabled}
        className="peer sr-only"
      />
      <span className="relative h-[22px] w-[38px] flex-none rounded-full bg-slate-300 transition-colors after:absolute after:left-[3px] after:top-[3px] after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-brand-600 peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2" />
      {(label || hint) && (
        <span className="min-w-0">
          {label && (
            <span className="block text-sm font-semibold text-slate-900">{label}</span>
          )}
          {hint && <span className="block text-xs text-slate-400">{hint}</span>}
        </span>
      )}
    </label>
  );
}
