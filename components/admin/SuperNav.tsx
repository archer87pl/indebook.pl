"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, List, Star } from "lucide-react";

const TABS = [
  { href: "/superadmin", label: "Pulpit", icon: Building2 },
  { href: "/superadmin/rezerwacje", label: "Rezerwacje", icon: List },
  { href: "/superadmin/opinie", label: "Opinie", icon: Star },
];

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
          <Icon size={14} strokeWidth={2} />
          {label}
        </Link>
      ))}
    </nav>
  );
}
