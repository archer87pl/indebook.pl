"use client";

// Podgląd wersji roboczej strony w iframie z przełącznikiem desktop/mobile.
// Iframe pokazuje /podglad-strony (wymaga sesji właściciela — ten sam origin).

import { useState } from "react";
import { Monitor, RotateCw, Smartphone } from "lucide-react";

export default function PreviewPane() {
  const [mobile, setMobile] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-[15px] font-bold">Podgląd na żywo</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMobile(false)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              !mobile ? "bg-brand-100 text-brand-700" : "text-slate-400 hover:bg-slate-100"
            }`}
            title="Widok komputera"
          >
            <Monitor size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMobile(true)}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              mobile ? "bg-brand-100 text-brand-700" : "text-slate-400 hover:bg-slate-100"
            }`}
            title="Widok telefonu"
          >
            <Smartphone size={14} />
          </button>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100"
            title="Odśwież podgląd"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>
      <div className="flex justify-center bg-slate-100 p-3">
        <iframe
          key={reloadKey}
          src="/podglad-strony"
          title="Podgląd strony"
          className={`h-[70vh] rounded-lg border border-slate-200 bg-white shadow-sm transition-all ${
            mobile ? "w-[375px]" : "w-full"
          }`}
        />
      </div>
    </section>
  );
}
