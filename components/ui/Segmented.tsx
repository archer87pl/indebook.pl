/**
 * Segmented control wg 1c (kanał, płatność): radio group,
 * aktywny segment = obwódka #1f7a4d + tło #eef7f1.
 * Czysty CSS (radio + peer) — działa w formularzach serwerowych bez JS.
 */
export default function Segmented({
  name,
  options,
  defaultValue,
  columns,
}: {
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  columns?: number;
}) {
  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0,1fr))`,
      }}
    >
      {options.map((opt) => (
        <label key={opt.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={opt.value}
            defaultChecked={defaultValue === opt.value}
            className="peer sr-only"
          />
          <span className="block rounded-[11px] border border-slate-200 bg-white px-3 py-2 text-center transition-colors hover:border-slate-300 peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2">
            <span className="block text-[13px] font-semibold text-slate-900">
              {opt.label}
            </span>
            {opt.hint && (
              <span className="block text-[10.5px] text-slate-400">{opt.hint}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
