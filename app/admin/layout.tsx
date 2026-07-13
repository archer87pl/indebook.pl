import Link from "next/link";
import { LogOut } from "lucide-react";
import Logo from "@/components/Logo";
import AdminNav, { type AdminNavItem } from "@/components/admin/AdminNav";
import AdminTopbar from "@/components/admin/AdminTopbar";
import MobileAdminNav from "@/components/admin/MobileAdminNav";
import Avatar from "@/components/ui/Avatar";
import { logout } from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { planDef } from "@/lib/plans";

export const dynamic = "force-dynamic";

const NAV: AdminNavItem[] = [
  { href: "/admin", label: "Pulpit", icon: "pulpit" },
  { href: "/admin/kalendarz", label: "Kalendarz", icon: "kalendarz" },
  { href: "/admin/rezerwacje", label: "Rezerwacje", icon: "rezerwacje" },
  { href: "/admin/goscie", label: "Goście", icon: "goscie" },
  { href: "/admin/platnosci", label: "Płatności", icon: "platnosci" },
  { href: "/admin/faktury", label: "Faktury", icon: "faktury" },
  { href: "/admin/kanaly", label: "Kanały", icon: "kanaly" },
  { href: "/admin/pokoje", label: "Pokoje", icon: "pokoje" },
  { href: "/admin/cennik", label: "Cennik", icon: "cennik" },
  { href: "/admin/opinie", label: "Opinie", icon: "opinie" },
  { href: "/admin/raporty", label: "Raporty", icon: "raporty" },
];

function todayLabel() {
  const label = new Date().toLocaleDateString("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, property } = await requireOwner();
  const activeReservations = await prisma.reservation.count({
    where: {
      unit: { unitType: { propertyId: property.id } },
      status: { not: "CANCELLED" },
      checkOut: { gte: todayISO() },
    },
  });

  const items = NAV.map((item) =>
    item.href === "/admin/rezerwacje"
      ? { ...item, badge: activeReservations }
      : item,
  );

  return (
    <div className="min-h-screen w-full lg:flex">
      {/* Rail nawigacji (desktop) wg 1c */}
      <aside className="sticky top-0 z-20 hidden h-screen w-[216px] flex-none flex-col overflow-y-auto bg-brand-900 px-3.5 py-[18px] lg:flex print:hidden">
        <Link href="/admin" className="px-2 pb-5 pt-1" aria-label="Rezio — pulpit">
          <Logo size={31} tone="dark" />
        </Link>

        <Link
          href="/admin/plan"
          className="mb-2 flex items-center gap-2.5 rounded-[10px] bg-white/[.06] px-2.5 py-2.5 transition-colors hover:bg-white/10"
          title="Plan i abonament"
        >
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-[7px] bg-brand-400/20 text-brand-400">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 21h18M6 21V8l6-4 6 4v13M10 12h4M10 16h4" />
            </svg>
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] font-semibold text-white">
              {property.name}
            </span>
            <span className="block text-[10px] font-semibold text-brand-400">
              {planDef(property.plan).label}
            </span>
          </span>
        </Link>

        <AdminNav items={items} />

        <div className="mt-auto space-y-0.5 border-t border-white/10 pt-3">
          <AdminNav
            items={[{ href: "/admin/obiekt", label: "Ustawienia", icon: "ustawienia" }]}
          />
          <div className="flex items-center gap-2.5 px-2.5 pt-2">
            <Avatar name={property.name} size={30} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">
                {user.email}
              </div>
              <div className="text-[10.5px] text-[#8fb5a2]">Recepcja</div>
            </div>
            <form action={logout}>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#8fb5a2] transition-colors hover:bg-white/10 hover:text-white"
                title="Wyloguj"
              >
                <LogOut size={14} strokeWidth={2} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Pasek mobilny: logo + menu hamburger (drawer w stylu railu) */}
      <div className="sticky top-0 z-20 lg:hidden print:hidden">
        <MobileAdminNav
          items={items}
          propertyName={property.name}
          planLabel={planDef(property.plan).label}
          userEmail={user.email}
          logout={logout}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar today={todayLabel()} />
        <main className="flex-1 px-4 py-4 lg:px-6 lg:py-5">{children}</main>
      </div>
    </div>
  );
}
