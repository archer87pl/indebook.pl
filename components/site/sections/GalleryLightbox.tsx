"use client";

// Prosty lightbox galerii bez zależności: grid miniatur + overlay ze
// strzałkami. Sterowanie klawiaturą: Esc zamyka, strzałki przewijają.

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export default function GalleryLightbox({
  photos,
  alt,
}: {
  photos: { id: number; path: string }[];
  alt: string;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const move = useCallback(
    (delta: number) => {
      setOpen((cur) => (cur === null ? null : (cur + delta + photos.length) % photos.length));
    },
    [photos.length]
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, move]);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setOpen(i)}
            className="group overflow-hidden rounded-xl"
            aria-label={`Powiększ zdjęcie ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.path}
              alt={`${alt} — zdjęcie ${i + 1}`}
              loading="lazy"
              className="h-44 w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>

      {open !== null && photos[open] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setOpen(null)}
            aria-label="Zamknij"
          >
            <X size={22} />
          </button>
          <button
            type="button"
            className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); move(-1); }}
            aria-label="Poprzednie zdjęcie"
          >
            <ChevronLeft size={26} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[open].path}
            alt={`${alt} — zdjęcie ${open + 1}`}
            className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={(e) => { e.stopPropagation(); move(1); }}
            aria-label="Następne zdjęcie"
          >
            <ChevronRight size={26} />
          </button>
        </div>
      )}
    </>
  );
}
