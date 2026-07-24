"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import Logo from "@/components/Logo";
import AdminNav, { type AdminNavItem } from "@/components/admin/AdminNav";
import { NavPending } from "@/components/admin/NavProgress";
import Avatar from "@/components/ui/Avatar";

/**
 * Mobilna nawigacja panelu: pasek z logo i hamburgerem, po otwarciu drawer
 * w stylu railu (ciemna zieleń) z pełną nawigacją, kartą obiektu,
 * ustawieniami i wylogowaniem. Zamyka się po zmianie trasy i po tapnięciu tła.
 */
export default function MobileAdminNav({
  items,
  propertyName,
  planLabel,
  userEmail,
  logout,
}: {
  items: AdminNavItem[];
  propertyName: string;
  planLabel: string;
  userEmail: string;
  logout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // nawigacja = zamknięcie menu (korekta stanu w trakcie renderu,
  // wg wzorca "adjusting state when a prop changes" z dokumentacji React)
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  // blokada scrolla strony pod otwartym drawerem
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="flex items-center justify-between bg-brand-900 px-4 py-3">
        <Link href="/admin" aria-label="Rezio — pulpit">
          <Logo size={26} tone="dark" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#cfe3d8] transition-colors hover:bg-white/10"
          aria-label="Otwórz menu"
          aria-expanded={open}
        >
          <Menu size={20} strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu panelu">
          {/* tło */}
          <button
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-label="Zamknij menu"
          />
          {/* drawer w stylu railu */}
          <div className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto bg-brand-900 px-3.5 py-[18px] shadow-[8px_0_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between px-2 pb-5 pt-1">
              <Link href="/admin" aria-label="Rezio — pulpit">
                <Logo size={31} tone="dark" />
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-[10px] text-[#cfe3d8] transition-colors hover:bg-white/10"
                aria-label="Zamknij menu"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

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
                  {propertyName}
                </span>
                <span className="block text-[10px] font-semibold text-brand-400">
                  {planLabel}
                </span>
              </span>
              <NavPending />
            </Link>

            <AdminNav items={items} />

            <div className="mt-auto space-y-0.5 border-t border-white/10 pt-3">
              <AdminNav
                items={[{ href: "/admin/obiekt", label: "Ustawienia", icon: "ustawienia" }]}
              />
              <div className="flex items-center gap-2.5 px-2.5 pt-2">
                <Avatar name={propertyName} size={30} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-white">{userEmail}</div>
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
          </div>
        </div>
      )}
    </>
  );
}
