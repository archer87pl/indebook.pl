"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { Building2, List, Loader2, ScrollText, Settings, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const TABS = [
  { href: "/superadmin", label: "Pulpit", icon: Building2 },
  { href: "/superadmin/rezerwacje", label: "Rezerwacje", icon: List },
  { href: "/superadmin/opinie", label: "Opinie", icon: Star },
  { href: "/superadmin/ustawienia", label: "Ustawienia", icon: Settings },
  { href: "/superadmin/logi", label: "Logi", icon: ScrollText },
];

/** Ikona zakładki — na czas nawigacji zamienia się w spinner (useLinkStatus). */
function TabIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 size={14} strokeWidth={2} className="animate-spin" />
  ) : (
    <Icon size={14} strokeWidth={2} />
  );
}

/** Zakładki panelu platformy (karta obiektu podświetla Pulpit). */
export default function SuperNav() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/superadmin"
      ? pathname === "/superadmin" || pathname.startsWith("/superadmin/obiekt")
      : pathname.startsWith(href);

  return (
    <nav className="flex flex-wrap items-center gap-1.5">
      {TABS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            active(href)
              ? "border border-brand-600 bg-brand-50 text-brand-700"
              : "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <TabIcon icon={Icon} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
