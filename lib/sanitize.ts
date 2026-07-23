// Sanityzacja treści HTML wpisywanych przez właścicieli obiektów w kreatorze
// stron. Strony działają na współdzielonej platformie — nigdy nie przepuszczamy
// skryptów ani zdarzeń. Sanityzujemy przy renderze (nie przy zapisie), więc
// zaostrzenie reguł działa wstecz na już zapisane treści.

import sanitizeHtml from "sanitize-html";

const LINK_SCHEMES = ["http", "https", "mailto", "tel"];

// Pola opisowe (np. „O obiekcie"): tylko proste formatowanie tekstu.
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "h3", "h4"],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: LINK_SCHEMES,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener" }),
    },
  });
}

const IFRAME_HOSTS = [
  "www.youtube.com",
  "youtube.com",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
  "maps.google.com",
  "www.google.com",
  "www.openstreetmap.org",
  "openstreetmap.org",
];

// Sekcja „Własny kod": szersza struktura, wciąż bez skryptów.
export function sanitizeCustomHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "div", "span", "section", "article", "figure", "figcaption", "img",
      "table", "thead", "tbody", "tr", "td", "th",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "blockquote", "hr", "p", "br", "b", "strong", "i", "em", "u",
      "a", "ul", "ol", "li", "iframe", "button",
    ],
    allowedAttributes: {
      "*": ["class", "style", "id"],
      a: ["href", "target"],
      img: ["src", "alt", "width", "height", "loading"],
      iframe: ["src", "width", "height", "allowfullscreen", "loading"],
    },
    allowedSchemes: LINK_SCHEMES,
    allowedIframeHostnames: IFRAME_HOSTS,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener" }),
    },
  });
}

// Własny CSS strony: wstrzykiwany do <style>. Usuwamy "<" (blokuje wyjście
// z tagu — jedyna ścieżka XSS) oraz konstrukcje ładujące zewnętrzne zasoby
// niezależnie od treści strony (@import) i martwe, ale ryzykowne expression().
// url() w tłach zostaje — to legalny sposób na własne obrazy z Blob.
export function sanitizeCss(css: string): string {
  return css
    .replace(/</g, "")
    .replace(/@import\b[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "");
}
