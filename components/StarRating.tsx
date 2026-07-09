"use client";

import { useState } from "react";

// Wybór oceny 1–5 gwiazdek. Ustawia ukryty input "rating" w formularzu
// server action. Bez wyboru pole jest puste → walidacja serwera odrzuca.
export default function StarRating() {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const active = hover || value;
  const labels = ["", "Słabo", "Może być", "Dobrze", "Bardzo dobrze", "Rewelacyjnie"];

  return (
    <div className="flex items-center gap-3">
      <input type="hidden" name="rating" value={value || ""} />
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setValue(n)}
            onMouseEnter={() => setHover(n)}
            aria-label={`${n} z 5`}
            className={`text-3xl leading-none px-0.5 transition-colors ${
              n <= active ? "text-accent-500" : "text-slate-300"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      {active > 0 && (
        <span className="text-sm text-slate-500">{labels[active]}</span>
      )}
    </div>
  );
}
