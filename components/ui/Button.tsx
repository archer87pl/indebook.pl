"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "accent" | "quiet" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  // ciemna zieleń marki — główne CTA
  primary:
    "bg-brand-900 text-white hover:bg-brand-950 focus-visible:ring-brand-600",
  // mint — CTA na ciemnym tle / wyróżnione akcje
  accent:
    "bg-brand-400 text-brand-950 hover:bg-brand-300 focus-visible:ring-brand-400",
  // biały z obwódką — akcje drugorzędne
  quiet:
    "bg-white border border-slate-200 text-slate-600 hover:border-brand-600 hover:text-brand-700 hover:bg-brand-50 focus-visible:ring-brand-600",
  // bez tła — akcje trzeciorzędne w wierszach tabel itp.
  ghost:
    "text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-brand-600",
  danger:
    "bg-danger-100 text-danger-600 hover:bg-danger-100/70 focus-visible:ring-danger-500",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-[10px] gap-1.5",
  md: "h-9 px-4 text-[13px] rounded-[11px] gap-2",
  lg: "h-11 px-6 text-sm rounded-[13px] gap-2",
};

const SPINNER: Record<Size, number> = { sm: 13, md: 14, lg: 15 };

type BaseProps = {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
};

type ButtonProps = BaseProps &
  (
    | ({ href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">)
    | ({ href?: undefined } & Omit<ComponentProps<"button">, "className">)
  );

/**
 * Przycisk design systemu 1c. Z `href` renderuje się jako <Link>.
 *
 * Przyciski `type="submit"` same pokazują stan wysyłki formularza
 * (useFormStatus): spinner + blokada, dopóki server action nie wróci.
 * Blokada chroni też przed podwójnym wysłaniem (np. dwiema rezerwacjami)
 * przy wolnym łączu. Poza formularzem hook zwraca pending=false, więc
 * zwykłe przyciski i linki działają bez zmian.
 */
export default function Button({
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: ButtonProps) {
  const { pending } = useFormStatus();
  const cls = `inline-flex items-center justify-center font-bold transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-70 ${VARIANTS[variant]} ${SIZES[size]} ${className}`;

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest;
    return (
      <Link href={href} className={cls} {...linkRest}>
        {children}
      </Link>
    );
  }

  const buttonRest = rest as ComponentProps<"button">;
  const busy = pending && buttonRest.type === "submit";
  return (
    <button
      className={cls}
      aria-busy={busy || undefined}
      {...buttonRest}
      disabled={busy || buttonRest.disabled}
    >
      {busy && (
        <Loader2
          size={SPINNER[size]}
          strokeWidth={2.4}
          className="animate-spin"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
