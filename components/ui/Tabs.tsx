import Link from "next/link";

export type TabItem = {
  href: string;
  label: string;
  count?: number;
  active?: boolean;
};

/** Zakładki statusów z licznikami wg 2b — linki (filtrowanie przez searchParams). */
export default function Tabs({ items }: { items: TabItem[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((tab) => (
        <Link
          key={`${tab.href}|${tab.label}`}
          href={tab.href}
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            tab.active
              ? "border border-brand-600 bg-brand-50 text-brand-700"
              : "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          {tab.label}
          {tab.count != null && (
            <span
              className={`rounded-full px-1.5 py-px text-[10.5px] font-bold tnum ${
                tab.active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {tab.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
