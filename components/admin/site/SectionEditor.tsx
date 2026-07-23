// Edytor sekcji strony WWW (server component): accordion z formularzem pól
// per sekcja + sterowanie widocznością/kolejnością. Celowo bez drag&drop
// i edycji inline — strzałki i zwykłe formularze (server actions).

import { ArrowDown, ArrowUp, Code2, Eye, EyeOff, Trash2 } from "lucide-react";
import SubmitButton from "@/components/ui/SubmitButton";
import type { Photo } from "@prisma/client";
import {
  addSiteSection,
  convertSectionToHtml,
  moveSiteSection,
  removeSiteSection,
  toggleSiteSection,
  updateSiteSection,
} from "@/lib/site-actions";
import { SECTION_LABELS, type SiteConfig, type SiteSection } from "@/lib/site-config";

const inputCls =
  "w-full rounded-[11px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600";
const labelCls = "mb-1 block text-[12.5px] font-semibold";
const iconBtnCls =
  "flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30";

/** Sekcje generowane z danych RezOp — mają przycisk „odepnij". */
const DATA_SECTIONS: SiteSection["type"][] = [
  "hero", "about", "units", "gallery", "amenities", "calendar", "attractions", "reviews", "contact",
];

function SectionFields({ section, photos }: { section: SiteSection; photos: Photo[] }) {
  switch (section.type) {
    case "hero":
      return (
        <>
          <label className="block">
            <span className={labelCls}>Nagłówek</span>
            <input name="headline" defaultValue={section.data.headline} maxLength={120} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Hasło pod nagłówkiem</span>
            <input name="tagline" defaultValue={section.data.tagline} maxLength={200} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Tekst przycisku</span>
            <input name="ctaLabel" defaultValue={section.data.ctaLabel} maxLength={40} className={inputCls} />
          </label>
          {photos.length > 0 && (
            <div>
              <span className={labelCls}>Zdjęcie w tle</span>
              <div className="flex flex-wrap gap-2">
                {photos.map((ph) => (
                  <label key={ph.id} className="cursor-pointer">
                    <input
                      type="radio"
                      name="photoId"
                      value={ph.id}
                      defaultChecked={section.data.photoId === ph.id}
                      className="peer sr-only"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ph.path}
                      alt=""
                      className="h-12 w-20 rounded-md border-2 border-transparent object-cover opacity-80 transition-all peer-checked:border-brand-600 peer-checked:opacity-100"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      );
    case "about":
      return (
        <>
          <label className="block">
            <span className={labelCls}>Tytuł sekcji</span>
            <input name="title" defaultValue={section.data.title} maxLength={80} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>
              Treść{" "}
              <span className="font-normal text-slate-400">
                (możesz używać prostego HTML: &lt;b&gt;, &lt;a&gt;, listy)
              </span>
            </span>
            <textarea name="html" defaultValue={section.data.html} rows={7} className={inputCls} />
          </label>
        </>
      );
    case "attractions":
      return (
        <>
          <label className="block">
            <span className={labelCls}>Tytuł sekcji</span>
            <input name="title" defaultValue={section.data.title} maxLength={80} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>
              Atrakcje{" "}
              <span className="font-normal text-slate-400">
                (jedna na linię: Nazwa | opis | odległość)
              </span>
            </span>
            <textarea
              name="items"
              defaultValue={section.data.items
                .map((i) => `${i.name} | ${i.desc} | ${i.distance}`)
                .join("\n")}
              rows={6}
              placeholder={"Jezioro Białe | plaża i wypożyczalnia kajaków | 300 m\nSzlak górski | wejście na Wielką Sowę | 2 km"}
              className={inputCls}
            />
          </label>
        </>
      );
    case "contact":
      return (
        <>
          <label className="block">
            <span className={labelCls}>Tytuł sekcji</span>
            <input name="title" defaultValue={section.data.title} maxLength={80} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>Zachęta nad formularzem</span>
            <textarea name="intro" defaultValue={section.data.intro} maxLength={300} rows={2} className={inputCls} />
          </label>
        </>
      );
    case "customHtml":
      return (
        <label className="block">
          <span className={labelCls}>
            Kod HTML{" "}
            <span className="font-normal text-slate-400">
              (skrypty są usuwane przy wyświetlaniu)
            </span>
          </span>
          <textarea
            name="html"
            defaultValue={section.data.html}
            rows={10}
            spellCheck={false}
            className={`${inputCls} font-mono text-xs`}
          />
        </label>
      );
    default:
      // sekcje danych na żywo: units / gallery / amenities / calendar / reviews
      return (
        <>
          <label className="block">
            <span className={labelCls}>Tytuł sekcji</span>
            <input name="title" defaultValue={section.data.title} maxLength={80} className={inputCls} />
          </label>
          <p className="text-xs leading-relaxed text-slate-400">
            Treść tej sekcji (zdjęcia, ceny, dostępność, opinie) pobiera się automatycznie
            z Twoich danych w Rezio i zawsze jest aktualna.
          </p>
        </>
      );
  }
}

export default function SectionEditor({
  config,
  photos,
  detachId,
}: {
  config: SiteConfig;
  photos: Photo[];
  detachId?: string;
}) {
  const count = config.sections.length;
  return (
    <section id="sekcje" className="card space-y-3 p-5">
      <h2 className="text-[15px] font-bold">Sekcje strony</h2>
      <div className="space-y-2">
        {config.sections.map((section, i) => (
          <details
            key={section.id}
            className="group rounded-[11px] border border-slate-200"
            open={detachId === section.id}
          >
            <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5">
              <span
                className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${
                  section.enabled ? "" : "text-slate-400 line-through"
                }`}
              >
                {SECTION_LABELS[section.type]}
              </span>
              <span className="flex flex-none items-center gap-0.5">
                <form action={toggleSiteSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                  <SubmitButton
                    className={iconBtnCls}
                    title={section.enabled ? "Ukryj sekcję" : "Pokaż sekcję"}
                    pendingMode="replace"
                  >
                    {section.enabled ? <Eye size={14} /> : <EyeOff size={14} />}
                  </SubmitButton>
                </form>
                <form action={moveSiteSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="dir" value="up" />
                  <SubmitButton className={iconBtnCls} title="Przesuń wyżej" disabled={i === 0} pendingMode="replace">
                    <ArrowUp size={14} />
                  </SubmitButton>
                </form>
                <form action={moveSiteSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                  <input type="hidden" name="dir" value="down" />
                  <SubmitButton className={iconBtnCls} title="Przesuń niżej" disabled={i === count - 1} pendingMode="replace">
                    <ArrowDown size={14} />
                  </SubmitButton>
                </form>
                <form action={removeSiteSection}>
                  <input type="hidden" name="sectionId" value={section.id} />
                  <SubmitButton
                    className={`${iconBtnCls} hover:text-red-600`}
                    title="Usuń sekcję"
                    pendingMode="replace"
                  >
                    <Trash2 size={14} />
                  </SubmitButton>
                </form>
              </span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-3 py-3">
              <form action={updateSiteSection} className="space-y-3">
                <input type="hidden" name="sectionId" value={section.id} />
                <SectionFields section={section} photos={photos} />
                <SubmitButton className="rounded-[11px] bg-brand-900 px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-brand-950">
                  Zapisz sekcję
                </SubmitButton>
              </form>
              {section.type !== "customHtml" && DATA_SECTIONS.includes(section.type) && (
                <div className="border-t border-slate-100 pt-3">
                  {detachId === section.id ? (
                    <div className="space-y-2 rounded-[11px] border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs leading-relaxed text-amber-800">
                        Po odpięciu sekcja stanie się zwykłym kodem HTML: przestanie
                        aktualizować się z danych Rezio (ceny, zdjęcia, opinie), a jej
                        formularz zniknie. Tej operacji nie można cofnąć.
                      </p>
                      <div className="flex gap-2">
                        <form action={convertSectionToHtml}>
                          <input type="hidden" name="sectionId" value={section.id} />
                          <SubmitButton className="rounded-[9px] bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">
                            Odepnij sekcję
                          </SubmitButton>
                        </form>
                        <a
                          href="/admin/strona#sekcje"
                          className="rounded-[9px] border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600"
                        >
                          Anuluj
                        </a>
                      </div>
                    </div>
                  ) : (
                    <a
                      href={`/admin/strona?detach=${section.id}#sekcje`}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-700"
                    >
                      <Code2 size={13} />
                      Konwertuj na własny kod (dla zaawansowanych)
                    </a>
                  )}
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
      <form action={addSiteSection} className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <select
          name="type"
          className="flex-1 rounded-[11px] border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-600"
          aria-label="Typ nowej sekcji"
        >
          {Object.entries(SECTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
        <SubmitButton className="rounded-[11px] border border-slate-200 px-4 py-2 text-[13px] font-bold text-slate-700 transition-colors hover:border-brand-600">
          + Dodaj sekcję
        </SubmitButton>
      </form>
    </section>
  );
}
