"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BedDouble,
  CalendarDays,
  CreditCard,
  FileText,
  LayoutGrid,
  List,
  Loader2,
  Settings,
  Share2,
  Star,
  Tags,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
 * Ikona pozycji menu, która na czas nawigacji zamienia się w spinner.
 * Musi być osobnym komponentem — useLinkStatus działa tylko wewnątrz <Link>.
 * Podmiana ikony (a nie dokładanie elementu) nie powoduje przeskoku layoutu.
 */
function NavIcon({ icon: Icon }: { icon: LucideIcon }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 size={16} strokeWidth={2} className="animate-spin" />
  ) : (
    <Icon size={16} strokeWidth={2} />
  );
}

/**
 * Pozycje nawigacji railu (desktop i drawer mobilny).
 * Aktywna pozycja: tło mint + ciemny tekst; pozostałe: hover białe 6%.
 */
export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

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
            <NavIcon icon={Icon} />
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
