// Szablony startowe i motywy kolorystyczne stron WWW obiektów.
// Palety są zamknięte (bez dowolnego RGB) — spójność wizualna stron.

export type SitePalette = {
  key: string;
  label: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  primaryText: string;
  accent: string;
};

export type SiteTemplate = {
  key: string;
  label: string;
  blurb: string;
  palettes: SitePalette[];
  defaultPalette: string;
  defaultFont: string;
};

export const SITE_FONTS: Record<string, { label: string; css: string }> = {
  sans: {
    label: "Nowoczesna (bezszeryfowa)",
    css: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  },
  serif: {
    label: "Klasyczna (szeryfowa)",
    css: "Georgia, 'Times New Roman', serif",
  },
  display: {
    label: "Wyrazista (Space Grotesk)",
    css: "var(--font-space-grotesk), system-ui, sans-serif",
  },
};

export const SITE_TEMPLATES: SiteTemplate[] = [
  {
    key: "gorski",
    label: "Górski / rustykalny",
    blurb: "Ciepłe barwy ziemi, drewno i natura — dla domków i pensjonatów w górach lub lesie.",
    palettes: [
      { key: "las", label: "Leśny", bg: "#f7f5f0", surface: "#ffffff", text: "#2d2a24", muted: "#6b6459", primary: "#3f6212", primaryText: "#ffffff", accent: "#b45309" },
      { key: "drewno", label: "Drewniany", bg: "#faf6ef", surface: "#ffffff", text: "#3b2f24", muted: "#7d6f5d", primary: "#92400e", primaryText: "#ffffff", accent: "#4d7c0f" },
      { key: "kamien", label: "Kamienny", bg: "#f4f4f2", surface: "#ffffff", text: "#292524", muted: "#78716c", primary: "#44403c", primaryText: "#ffffff", accent: "#a16207" },
    ],
    defaultPalette: "las",
    defaultFont: "serif",
  },
  {
    key: "nadmorski",
    label: "Nadmorski / wakacyjny",
    blurb: "Jasne tło i błękity — dla apartamentów nad morzem i wakacyjnych klimatów.",
    palettes: [
      { key: "morze", label: "Morski", bg: "#f8fbfd", surface: "#ffffff", text: "#0f2a3d", muted: "#5b7386", primary: "#0369a1", primaryText: "#ffffff", accent: "#0891b2" },
      { key: "piasek", label: "Piaskowy", bg: "#fdfaf3", surface: "#ffffff", text: "#33302a", muted: "#7c7568", primary: "#0e7490", primaryText: "#ffffff", accent: "#d97706" },
      { key: "turkus", label: "Turkusowy", bg: "#f6fdfc", surface: "#ffffff", text: "#134e4a", muted: "#5f7a77", primary: "#0d9488", primaryText: "#ffffff", accent: "#0284c7" },
    ],
    defaultPalette: "morze",
    defaultFont: "sans",
  },
  {
    key: "miejski",
    label: "Miejski / premium",
    blurb: "Ciemne tło i złote akcenty — elegancki styl dla apartamentów w mieście.",
    palettes: [
      { key: "noc", label: "Nocny", bg: "#15171c", surface: "#1f232b", text: "#f1f0ec", muted: "#9b988f", primary: "#c9a227", primaryText: "#15171c", accent: "#e5d3a1" },
      { key: "grafit", label: "Grafitowy", bg: "#1c1c1e", surface: "#26262a", text: "#f4f4f5", muted: "#a1a1aa", primary: "#b08d57", primaryText: "#1c1c1e", accent: "#d4b483" },
      { key: "burgund", label: "Burgundowy", bg: "#1a1416", surface: "#251c1f", text: "#f5f0f1", muted: "#a89a9e", primary: "#9f1239", primaryText: "#ffffff", accent: "#d4a373" },
    ],
    defaultPalette: "noc",
    defaultFont: "display",
  },
  {
    key: "uniwersalny",
    label: "Minimalistyczny / uniwersalny",
    blurb: "Neutralna, jasna baza — dobry start pod dowolny charakter obiektu.",
    palettes: [
      { key: "czysty", label: "Czysty", bg: "#ffffff", surface: "#f8fafc", text: "#0f172a", muted: "#64748b", primary: "#0f172a", primaryText: "#ffffff", accent: "#2563eb" },
      { key: "cieply", label: "Ciepły", bg: "#fdfcfa", surface: "#f7f4ef", text: "#1c1917", muted: "#78716c", primary: "#1c1917", primaryText: "#ffffff", accent: "#ea580c" },
      { key: "zielony", label: "Zielony", bg: "#fbfdfb", surface: "#f3f7f3", text: "#14261a", muted: "#5f6f64", primary: "#166534", primaryText: "#ffffff", accent: "#0d9488" },
    ],
    defaultPalette: "czysty",
    defaultFont: "sans",
  },
];

export function siteTemplate(key: string): SiteTemplate {
  return SITE_TEMPLATES.find((t) => t.key === key) ?? SITE_TEMPLATES[3];
}

export function findPalette(templateKey: string, paletteKey: string): SitePalette {
  const t = siteTemplate(templateKey);
  return t.palettes.find((p) => p.key === paletteKey) ?? t.palettes[0];
}

export function themeVars(theme: { palette: string; font: string }, templateKey: string): Record<string, string> {
  const p = findPalette(templateKey, theme.palette);
  const font = SITE_FONTS[theme.font] ?? SITE_FONTS.sans;
  return {
    "--site-bg": p.bg,
    "--site-surface": p.surface,
    "--site-text": p.text,
    "--site-muted": p.muted,
    "--site-primary": p.primary,
    "--site-primary-text": p.primaryText,
    "--site-accent": p.accent,
    "--site-font": font.css,
  };
}
