export type ChannelDef = {
  key: string;
  label: string;
  emoji: string;
  /** skąd wziąć URL importu (ich kalendarz → Notelo) */
  importHint: string;
  /** gdzie wkleić URL eksportu Notelo (Notelo → ich kalendarz) */
  exportHint: string;
};

export const CHANNELS: ChannelDef[] = [
  {
    key: "BOOKING",
    label: "Booking.com",
    emoji: "🔵",
    importHint:
      "Extranet → Ceny i dostępność → Synchronizacja kalendarzy → „Eksportuj kalendarz” — skopiuj URL pliku .ics i wklej poniżej.",
    exportHint:
      "Extranet → Ceny i dostępność → Synchronizacja kalendarzy → „Dodaj kalendarz” — wklej URL eksportu Notelo.",
  },
  {
    key: "AIRBNB",
    label: "Airbnb",
    emoji: "🔴",
    importHint:
      "Kalendarz → Dostępność → Połącz z innym kalendarzem → „Eksportuj kalendarz” — skopiuj URL .ics.",
    exportHint:
      "Kalendarz → Dostępność → Połącz z innym kalendarzem → „Importuj kalendarz” — wklej URL eksportu Notelo.",
  },
  {
    key: "VRBO",
    label: "Vrbo / Abritel",
    emoji: "🟠",
    importHint: "Calendar → Import/Export → „Export calendar” — skopiuj URL .ics.",
    exportHint: "Calendar → Import/Export → „Import calendar” — wklej URL eksportu Notelo.",
  },
  {
    key: "OTHER",
    label: "Inny (iCal)",
    emoji: "⚪",
    importHint: "Wklej dowolny publiczny URL kalendarza w formacie iCal (.ics).",
    exportHint: "Wklej URL eksportu Notelo w systemie obsługującym import iCal.",
  },
];

export function channelDef(key: string): ChannelDef {
  return CHANNELS.find((c) => c.key === key) ?? CHANNELS[CHANNELS.length - 1];
}
