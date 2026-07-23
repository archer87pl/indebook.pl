"use client";

// Wizard pierwszego uruchomienia kreatora strony WWW: szablon → dane →
// personalizacja → adres i start. Stan lokalny, na końcu jeden submit do
// server action createSite.

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert } from "lucide-react";
import SubmitButton from "@/components/ui/SubmitButton";
import { createSite } from "@/lib/site-actions";
import type { SiteTemplate } from "@/lib/site-themes";

export type WizardDataSummary = {
  photoCount: number;
  unitTypeCount: number;
  hasDescription: boolean;
  hasAddress: boolean;
};

const STEPS = ["Szablon", "Twoje dane", "Wygląd", "Adres strony"];

export default function SiteWizard({
  templates,
  fonts,
  suggestedSubdomain,
  baseDomain,
  data,
}: {
  templates: SiteTemplate[];
  fonts: { key: string; label: string }[];
  suggestedSubdomain: string;
  baseDomain: string;
  data: WizardDataSummary;
}) {
  const [step, setStep] = useState(0);
  const [templateKey, setTemplateKey] = useState(templates[0].key);
  const template = templates.find((t) => t.key === templateKey) ?? templates[0];
  const [palette, setPalette] = useState(template.defaultPalette);
  const [font, setFont] = useState(template.defaultFont);
  const [subdomain, setSubdomain] = useState(suggestedSubdomain);

  function pickTemplate(t: SiteTemplate) {
    setTemplateKey(t.key);
    setPalette(t.defaultPalette);
    setFont(t.defaultFont);
  }

  const dataRows: { ok: boolean; label: string; href: string; hint: string }[] = [
    {
      ok: data.unitTypeCount > 0,
      label: `Pokoje / apartamenty (${data.unitTypeCount})`,
      href: "/admin/pokoje",
      hint: "Karty apartamentów i kalendarz cen na stronie.",
    },
    {
      ok: data.photoCount > 0,
      label: `Zdjęcia obiektu (${data.photoCount})`,
      href: "/admin/obiekt",
      hint: "Tło nagłówka i galeria.",
    },
    {
      ok: data.hasDescription,
      label: "Opis obiektu",
      href: "/admin/obiekt",
      hint: "Sekcja „O obiekcie”.",
    },
    {
      ok: data.hasAddress,
      label: "Adres obiektu",
      href: "/admin/obiekt",
      hint: "Mapa i stopka strony.",
    },
  ];

  return (
    <div className="card mx-auto max-w-3xl p-6">
      {/* pasek kroków */}
      <ol className="mb-6 flex items-center gap-2 text-[11.5px] font-semibold">
        {STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${
                i < step
                  ? "bg-brand-600 text-white"
                  : i === step
                    ? "bg-brand-100 text-brand-700 ring-1 ring-brand-600"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <span className={i === step ? "text-slate-900" : "text-slate-400"}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Wybierz szablon startowy</h2>
          <p className="text-sm text-slate-500">
            Szablon ustawia charakter strony — kolory i typografię dopasujesz w następnym kroku,
            a wszystko możesz później zmienić.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {templates.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pickTemplate(t)}
                className={`rounded-[14px] border p-4 text-left transition-colors ${
                  t.key === templateKey
                    ? "border-brand-600 bg-brand-50"
                    : "border-slate-200 bg-white hover:border-brand-300"
                }`}
              >
                <div className="mb-2 flex gap-1.5">
                  {t.palettes[0] &&
                    [t.palettes[0].primary, t.palettes[0].accent, t.palettes[0].bg].map((c) => (
                      <span
                        key={c}
                        className="h-5 w-5 rounded-full border border-black/10"
                        style={{ background: c }}
                      />
                    ))}
                </div>
                <div className="text-sm font-bold">{t.label}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.blurb}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Stronę wypełnimy Twoimi danymi</h2>
          <p className="text-sm text-slate-500">
            Kreator użyje danych, które masz już w Rezio — bez ponownego wpisywania.
            Braki możesz uzupełnić teraz albo później.
          </p>
          <ul className="space-y-2">
            {dataRows.map((row) => (
              <li
                key={row.label}
                className="flex items-center gap-3 rounded-[11px] border border-slate-200 px-4 py-3"
              >
                {row.ok ? (
                  <Check size={16} strokeWidth={2.5} className="flex-none text-brand-600" />
                ) : (
                  <CircleAlert size={16} strokeWidth={2} className="flex-none text-amber-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{row.label}</span>
                  <span className="block text-xs text-slate-400">{row.hint}</span>
                </span>
                {!row.ok && (
                  <a
                    href={row.href}
                    target="_blank"
                    className="flex-none text-xs font-semibold text-brand-600 hover:underline"
                  >
                    Uzupełnij →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <h2 className="text-lg font-bold">Dopasuj wygląd</h2>
          <div>
            <p className="mb-2 text-sm font-semibold">Paleta kolorów</p>
            <div className="flex flex-wrap gap-2">
              {template.palettes.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPalette(p.key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    palette === p.key
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 hover:border-brand-300"
                  }`}
                >
                  <span className="flex gap-1">
                    <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: p.primary }} />
                    <span className="h-4 w-4 rounded-full border border-black/10" style={{ background: p.accent }} />
                  </span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Typografia</p>
            <div className="flex flex-wrap gap-2">
              {fonts.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFont(f.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    font === f.key
                      ? "border-brand-600 bg-brand-50"
                      : "border-slate-200 hover:border-brand-300"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Logo i zdjęcie nagłówka ustawisz po utworzeniu strony, w karcie „Wygląd”.
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold">Adres Twojej strony</h2>
          <p className="text-sm text-slate-500">
            Strona wystartuje pod bezpłatną subdomeną. Własną domenę (np. mojobiekt.pl)
            podepniesz później w ustawieniach strony.
          </p>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Subdomena</span>
            <span className="flex items-center overflow-hidden rounded-[11px] border border-slate-200 focus-within:border-brand-600">
              <input
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"
                aria-label="Subdomena"
              />
              <span className="flex-none bg-slate-50 px-3 py-2.5 text-sm text-slate-400">
                .{baseDomain}
              </span>
            </span>
          </label>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft size={15} /> Wstecz
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-1.5 rounded-[11px] bg-brand-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-950"
          >
            Dalej <ArrowRight size={15} />
          </button>
        ) : (
          <form action={createSite}>
            <input type="hidden" name="template" value={templateKey} />
            <input type="hidden" name="palette" value={palette} />
            <input type="hidden" name="font" value={font} />
            <input type="hidden" name="subdomain" value={subdomain} />
            <SubmitButton className="flex items-center gap-1.5 rounded-[11px] bg-brand-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-950">
              Utwórz stronę
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
