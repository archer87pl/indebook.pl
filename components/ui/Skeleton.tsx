/**
 * Prostokąt-wypełniacz do stanów ładowania (loading.tsx).
 * Pulsuje w kolorze obwódek design systemu; `aria-hidden`, bo to czysta
 * dekoracja — komunikat dla czytników ekranu daje wrapper w loading.tsx.
 */
export default function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`}
    />
  );
}
