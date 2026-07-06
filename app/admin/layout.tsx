import Link from "next/link";
import { logout } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { planDef } from "@/lib/plans";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Pulpit" },
  { href: "/admin/rezerwacje", label: "Rezerwacje" },
  { href: "/admin/kalendarz", label: "Kalendarz" },
  { href: "/admin/kanaly", label: "Kanały" },
  { href: "/admin/pokoje", label: "Pokoje" },
  { href: "/admin/cennik", label: "Cennik" },
  { href: "/admin/raporty", label: "Raporty" },
  { href: "/admin/obiekt", label: "Obiekt" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, property } = await requireOwner();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Panel obiektu
          </p>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-brand-950">{property.name}</h2>
            <Link
              href="/admin/plan"
              className="inline-block rounded-full bg-brand-100 text-brand-800 hover:bg-brand-200 px-2.5 py-0.5 text-xs font-semibold transition-colors"
              title="Zobacz lub zmień plan"
            >
              {planDef(property.plan).label}
            </Link>
          </div>
        </div>
        <div className="text-right text-sm">
          <Link
            href={`/o/${property.slug}`}
            className="text-brand-700 font-semibold hover:underline"
          >
            Zobacz stronę obiektu →
          </Link>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
      </div>
      <nav className="flex flex-wrap items-center gap-1 bg-white rounded-xl border border-slate-200 p-2">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-800"
          >
            {item.label}
          </Link>
        ))}
        <div className="flex-1" />
        <form action={logout}>
          <button className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-red-600">
            Wyloguj
          </button>
        </form>
      </nav>
      {children}
    </div>
  );
}
