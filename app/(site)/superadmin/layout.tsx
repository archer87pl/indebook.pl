import { LogOut } from "lucide-react";
import SuperNav from "@/components/admin/SuperNav";
import { logout } from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Wspólny nagłówek i nawigacja panelu platformy (superadmin). */
export default async function SuperadminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireSuperadmin();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="th">Panel platformy</p>
          <h1 className="text-2xl font-bold">Superadmin</h1>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-xs text-slate-400">{admin.email}</span>
          <form action={logout}>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-danger-600">
              <LogOut size={13} strokeWidth={2} /> Wyloguj
            </button>
          </form>
        </div>
      </div>
      <SuperNav />
      {children}
    </div>
  );
}
