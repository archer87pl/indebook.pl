import type { ReactNode } from "react";

/** Karta powierzchni wg 1c: białe tło, promień 14px, obwódka #e6ede9, subtelny cień. */
export function Card({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-[14px] border border-slate-200 shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}

/** Nagłówek karty: tytuł sekcji 14.5–16px/700 + opcjonalna akcja po prawej. */
export function CardHeader({
  title,
  sub,
  action,
}: {
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-[18px] py-3.5">
      <div className="min-w-0">
        <h2 className="truncate text-[15px] font-bold">{title}</h2>
        {sub && <p className="text-[11.5px] text-slate-400">{sub}</p>}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  );
}

export function CardBody({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={`p-[18px] ${className}`}>{children}</div>;
}
