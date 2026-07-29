import { describe, expect, it } from "vitest";
import { CHANNELS, channelDef } from "./channels";
import { SUGGESTED_FAQ } from "./faq";

// Definicje kanałów sterują ekranem „Kanały": etykietą, ikoną i instrukcją
// krok po kroku. Klucz kanału bierze się z bazy (IcalFeed.channel), więc
// wartość spoza listy nie może wywrócić renderu.

describe("channelDef", () => {
  it("znajduje kanał po kluczu", () => {
    expect(channelDef("BOOKING").label).toBe("Booking.com");
    expect(channelDef("AIRBNB").label).toBe("Airbnb");
  });

  it("nieznany klucz degraduje do wariantu ogólnego, a nie do undefined", () => {
    // stary feed z usuniętym kanałem albo literówka w bazie nie mogą
    // wyrzucić właściciela z ekranu kanałów
    expect(channelDef("PORTAL_KTORY_ZNIKNAL").key).toBe("OTHER");
    expect(channelDef("").key).toBe("OTHER");
  });

  it("wariant ogólny jest ostatni na liście — na nim opiera się degradacja", () => {
    expect(CHANNELS[CHANNELS.length - 1].key).toBe("OTHER");
  });
});

describe("CHANNELS", () => {
  it("klucze są unikalne", () => {
    const keys = CHANNELS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("każdy kanał ma etykietę, ikonę i obie instrukcje", () => {
    // brak wskazówki zostawia właściciela z pustym ekranem i pytaniem,
    // skąd wziąć adres kalendarza
    for (const channel of CHANNELS) {
      expect(channel.label.length, channel.key).toBeGreaterThan(0);
      expect(channel.emoji.length, channel.key).toBeGreaterThan(0);
      expect(channel.importHint.length, `import ${channel.key}`).toBeGreaterThan(20);
      expect(channel.exportHint.length, `eksport ${channel.key}`).toBeGreaterThan(20);
    }
  });
});

describe("SUGGESTED_FAQ", () => {
  it("podpowiedzi się nie powtarzają", () => {
    expect(new Set(SUGGESTED_FAQ).size).toBe(SUGGESTED_FAQ.length);
  });

  it("każda podpowiedź jest pytaniem", () => {
    for (const question of SUGGESTED_FAQ) {
      expect(question, question).toMatch(/\?$/);
    }
  });
});
