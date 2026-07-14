"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

/**
 * Natywny przycisk wysyłki z własną stylizacją — dla miejsc, gdzie nie pasuje
 * żaden wariant <Button> (np. CTA na landingu czy ikonowy przycisk czatu).
 * Pokazuje spinner i blokuje się na czas trwania server action, co chroni
 * przed podwójnym wysłaniem.
 *
 * `pendingMode`:
 *  - "prepend" (domyślnie) — spinner przed treścią (przyciski z tekstem),
 *  - "replace" — spinner zamiast treści (przyciski ikonowe o stałym rozmiarze,
 *    gdzie doklejenie spinnera rozwaliłoby układ).
 */
export default function SubmitButton({
  children,
  className = "",
  spinnerSize = 15,
  pendingMode = "prepend",
  ...rest
}: Omit<ComponentProps<"button">, "type"> & {
  children: ReactNode;
  spinnerSize?: number;
  pendingMode?: "prepend" | "replace";
}) {
  const { pending } = useFormStatus();
  const spinner = (
    <Loader2
      size={spinnerSize}
      strokeWidth={2.4}
      className="animate-spin"
      aria-hidden
    />
  );
  return (
    <button
      type="submit"
      aria-busy={pending || undefined}
      className={`${className} disabled:pointer-events-none disabled:opacity-70`}
      {...rest}
      disabled={pending || rest.disabled}
    >
      {pending && spinner}
      {pending && pendingMode === "replace" ? null : children}
    </button>
  );
}
