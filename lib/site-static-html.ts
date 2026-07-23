// Statyczny HTML sekcji dla operacji „Konwertuj na własny kod" (odpięcie).
// Świadomie prostszy niż komponenty React — to punkt startowy do ręcznej
// edycji, nie wierna kopia. Dane przestają się aktualizować po odpięciu
// (użytkownik jest o tym ostrzegany w edytorze).

import type { SiteSection } from "./site-config";

export type StaticHtmlCtx = {
  property: { name: string; description: string; address: string };
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderSectionHtml(section: SiteSection, ctx: StaticHtmlCtx): string {
  const p = ctx.property;
  switch (section.type) {
    case "hero":
      return `<div style="text-align:center;padding:60px 16px">
  <h1>${esc(section.data.headline || p.name)}</h1>
  ${section.data.tagline ? `<p>${esc(section.data.tagline)}</p>` : ""}
</div>`;
    case "about":
      return `<h2>${esc(section.data.title)}</h2>\n${section.data.html}`;
    case "attractions":
      return `<h2>${esc(section.data.title)}</h2>
<ul>
${section.data.items
  .map(
    (i) =>
      `  <li><b>${esc(i.name)}</b>${i.distance ? ` (${esc(i.distance)})` : ""}${
        i.desc ? ` — ${esc(i.desc)}` : ""
      }</li>`
  )
  .join("\n")}
</ul>`;
    case "contact":
      return `<h2>${esc(section.data.title)}</h2>
${section.data.intro ? `<p>${esc(section.data.intro)}</p>` : ""}
<p>${esc(p.address)}</p>`;
    case "customHtml":
      return section.data.html;
    // Sekcje danych na żywo — nie da się ich sensownie zamrozić w HTML,
    // zostawiamy komentarz-podpowiedź z tytułem.
    case "units":
    case "gallery":
    case "amenities":
    case "calendar":
    case "reviews": {
      const title = "title" in section.data ? section.data.title : "";
      return `<h2>${esc(title)}</h2>
<p><!-- Ta sekcja pokazywała dane na żywo z Rezio (${section.type}). Po odpięciu wstaw własną treść. --></p>`;
    }
  }
}
