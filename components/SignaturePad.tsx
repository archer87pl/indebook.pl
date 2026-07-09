"use client";

import { useEffect, useRef, useState } from "react";

// Pole podpisu odręcznego (palec/mysz/rysik) osadzane w formularzu server action.
// Wartość trafia do ukrytego inputa "signature" jako data URL PNG — dopiero po
// pierwszym pociągnięciu, więc pusty podpis nie przechodzi walidacji serwera.
//
// Bufor canvasa ma stały rozmiar (nie zależy od layoutu w momencie montowania),
// a wyświetlanie skaluje CSS — współrzędne wskaźnika mapujemy per zdarzenie.
const W = 560;
const H = 160;

export default function SignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    // białe tło — czytelny wydruk karty meldunkowej
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = rect.width > 0 ? W / rect.width : 1;
    const scaleY = rect.height > 0 ? H / rect.height : 1;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // brak aktywnego wskaźnika (np. zdarzenia syntetyczne) — rysuj mimo to
    }
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // kropka przy samym kliknięciu/tapnięciu
    ctx.lineTo(x + 0.1, y + 0.1);
    ctx.stroke();
    drawing.current = true;
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onUp() {
    if (!drawing.current) return;
    drawing.current = false;
    if (inputRef.current && canvasRef.current) {
      inputRef.current.value = canvasRef.current.toDataURL("image/png");
    }
    setHasInk(true);
  }

  function clear() {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    if (inputRef.current) inputRef.current.value = "";
    setHasInk(false);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        className="w-full h-40 rounded-lg border border-slate-300 bg-white touch-none cursor-crosshair"
      />
      <input ref={inputRef} type="hidden" name="signature" />
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {hasInk
            ? "✓ Podpis złożony"
            : "Podpisz się w polu powyżej — palcem, myszką lub rysikiem."}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-slate-500 hover:text-red-600 underline"
        >
          Wyczyść
        </button>
      </div>
    </div>
  );
}
