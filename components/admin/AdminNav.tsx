"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutGrid,
  List,
  Settings,
  Share2,
  Star,
  Tags,
  Users,
} from "lucide-react";

const ICONS = {
  pulpit: LayoutGrid,
  kalendarz: CalendarDays,
  rezerwacje: List,
  goscie: Users,
  platnosci: CreditCard,
  faktury: FileText,
  kanaly: Share2,
  pokoje: BedDouble,
  cennik: Tags,
  opinie: Star,
  raporty: BarChart3,
  ustawienia: Settings,
} as const;

export type AdminNavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
};

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Pozycje nawigacji railu (desktop) lub poziomego paska (mobile).
 * Aktywna pozycja: tło mint + ciemny tekst; pozostałe: hover białe 6%.
 */
export default function AdminNav({
  items,
  variant = "rail",
}: {
  items: AdminNavItem[];
  variant?: "rail" | "bar";
}) {
  const pathname = usePathname();

  if (variant === "bar") {
    return (
      <nav className="flex items-center gap-1 overflow-x-auto px-3 py-2">
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-none items-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-brand-400 text-brand-950"
                  : "text-slate-300 hover:bg-white/10"
              }`}
            >
              <Icon size={14} strokeWidth={2} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] transition-colors ${
              active
                ? "bg-brand-400 font-bold text-brand-950"
                : "font-medium text-[#cfe3d8] hover:bg-white/[.06]"
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            {item.label}
            {item.badge != null && item.badge > 0 && (
              <span
                className={`ml-auto rounded-full px-1.5 py-px text-[10.5px] font-bold ${
                  active
                    ? "bg-brand-950/15 text-brand-950"
                    : "bg-brand-400/20 text-brand-400"
                }`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
