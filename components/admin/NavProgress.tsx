"use client";

// Górny pasek postępu nawigacji panelu (styl 2026: cienka linia u góry, która
// pojawia się natychmiast po kliknięciu pozycji menu i domyka się po wczytaniu
// trasy). Zasilany przez useLinkStatus z linków nawigacji — bez zależności.
//
// Model: linki zgłaszają swój stan „pending" do kontekstu (begin/end); licznik
// > 0 oznacza trwającą nawigację. Pasek animuje się CSS-em (globals.css:
// .navprog-run / .navprog-done), a JS tylko przełącza fazę widoczności — dzięki
// czemu unikamy setState wprost w efekcie.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLinkStatus } from "next/link";

type NavProgressApi = { begin: () => void; end: () => void };
const NavProgressCtx = createContext<NavProgressApi | null>(null);

/** Reporter wpięty w konkretny <Link> — zgłasza jego stan nawigacji. */
export function NavPending() {
  const { pending } = useLinkStatus();
  const ctx = useContext(NavProgressCtx);
  useEffect(() => {
    if (!ctx || !pending) return;
    ctx.begin();
    return () => ctx.end();
  }, [pending, ctx]);
  return null;
}

/** Hook dla komponentów, które i tak wołają useLinkStatus (np. ikona menu). */
export function useReportNavPending(pending: boolean) {
  const ctx = useContext(NavProgressCtx);
  useEffect(() => {
    if (!ctx || !pending) return;
    ctx.begin();
    return () => ctx.end();
  }, [pending, ctx]);
}

function NavProgressBar({ running }: { running: boolean }) {
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(false);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (running && !wasRunning.current) {
      wasRunning.current = true;
      const raf = requestAnimationFrame(() => {
        setDone(false);
        setShown(true);
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!running && wasRunning.current) {
      wasRunning.current = false;
      const raf = requestAnimationFrame(() => setDone(true));
      const t = setTimeout(() => {
        setShown(false);
        setDone(false);
      }, 420);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    }
  }, [running]);

  if (!shown) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
    >
      <div
        className={`h-full rounded-r-full bg-gradient-to-r from-brand-500 via-brand-400 to-accent-400 shadow-[0_0_10px_1px] shadow-brand-400/60 ${
          done ? "navprog-done" : "navprog-run"
        }`}
      />
    </div>
  );
}

export function NavProgressProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const count = useRef(0);
  // stabilne API; licznik czytany tylko w wywołaniach (nie podczas renderu)
  const api = useMemo<NavProgressApi>(
    () => ({
      begin: () => {
        count.current += 1;
        setActive(count.current);
      },
      end: () => {
        count.current = Math.max(0, count.current - 1);
        setActive(count.current);
      },
    }),
    []
  );

  return (
    <NavProgressCtx.Provider value={api}>
      <NavProgressBar running={active > 0} />
      {children}
    </NavProgressCtx.Provider>
  );
}
