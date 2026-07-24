"use client";

// Toasty panelu: przejściowe powiadomienia o wyniku akcji. Server actions
// przekierowują z parametrem (?saved=1 / ?error=… / ?synced=N / ?invited=1);
// Toaster odczytuje go, pokazuje toast i usuwa parametr z adresu bez nawigacji
// (history.replaceState — bez uruchamiania paska postępu). Bez zależności.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, X } from "lucide-react";

type Kind = "success" | "error";
type Toast = { id: number; kind: Kind; text: string };

// parametr → (rodzaj, tekst). Wartość parametru dostajemy w funkcji tekstu.
const MAP: Record<string, { kind: Kind; text: (v: string) => string }> = {
  error: { kind: "error", text: (v) => decodeURIComponent(v) },
  saved: { kind: "success", text: () => "Zapisano zmiany." },
  synced: { kind: "success", text: (v) => `Synchronizacja zakończona — zaimportowane terminy: ${v}.` },
  invited: { kind: "success", text: () => "Link do meldunku online wysłany do gościa." },
};
const PARAMS = Object.keys(MAP);

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex w-[min(360px,calc(100vw-2rem))] items-start gap-2.5 rounded-[12px] border border-slate-200 bg-white px-4 py-3 shadow-[0_12px_30px_-10px_rgba(15,35,26,0.35)] toast-in"
    >
      {toast.kind === "success" ? (
        <CheckCircle2 size={18} strokeWidth={2.2} className="mt-px flex-none text-brand-600" />
      ) : (
        <CircleAlert size={18} strokeWidth={2.2} className="mt-px flex-none text-red-500" />
      )}
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-slate-700">{toast.text}</p>
      <button
        onClick={onClose}
        aria-label="Zamknij powiadomienie"
        className="-mr-1 -mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      >
        <X size={14} strokeWidth={2.4} />
      </button>
    </div>
  );
}

export default function Toaster() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const seenRef = useRef("");

  useEffect(() => {
    const hits = PARAMS.filter((p) => params.get(p) !== null);
    // brak parametru wyniku → wyzeruj strażnika, żeby ten sam błąd/komunikat
    // pokazany ponownie (np. druga próba akcji) znów wywołał toast
    if (hits.length === 0) {
      seenRef.current = "";
      return;
    }
    const key = `${pathname}|${hits.map((p) => `${p}=${params.get(p)}`).join("&")}`;
    if (seenRef.current === key) return; // strażnik podwójnego wywołania (StrictMode)
    seenRef.current = key;

    const raf = requestAnimationFrame(() => {
      const created: Toast[] = hits.map((p) => {
        const cfg = MAP[p];
        return { id: ++idRef.current, kind: cfg.kind, text: cfg.text(params.get(p) ?? "") };
      });
      setToasts((t) => [...t, ...created]);
      for (const toast of created) {
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== toast.id)), 5000);
      }
    });

    // zdejmij obsłużone parametry z adresu przez router (utrzymuje synchronizację
    // stanu Next — inaczej useSearchParams zwracałby stary parametr i ten sam
    // komunikat nie pokazałby się drugi raz). Pozostałe parametry zostają.
    const sp = new URLSearchParams(params.toString());
    for (const p of hits) sp.delete(p);
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });

    return () => cancelAnimationFrame(raf);
  }, [params, pathname, router]);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[80] flex flex-col gap-2.5 print:hidden">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onClose={() => setToasts((t) => t.filter((x) => x.id !== toast.id))}
        />
      ))}
    </div>
  );
}
