import { describe, expect, it } from "vitest";
import { stubProvider } from "./provider";

const input = {
  marketId: "mkt_gdansk",
  basePriceGr: 20000,
  minPriceGr: 14000,
  maxPriceGr: 36000,
  from: "2026-07-09", // czwartek
  to: "2026-07-11", // sobota (włącznie)
};

describe("stubProvider", () => {
  it("zwraca dobę po dobie, z „to\" włącznie", async () => {
    const days = await stubProvider.quote(input);
    expect(days.map((d) => d.date)).toEqual(["2026-07-09", "2026-07-10", "2026-07-11"]);
  });

  it("podbija noce weekendowe o 15%", async () => {
    const days = await stubProvider.quote(input);
    expect(days[0].priceGr).toBe(20000); // czwartek — bez korekty
    expect(days[1].priceGr).toBe(23000); // piątek
    expect(days[2].priceGr).toBe(23000); // sobota
  });

  it("nie zależy od dzisiejszej daty", async () => {
    // stub celowo nie patrzy na zegar — inaczej te asercje psułyby się z czasem
    const past = await stubProvider.quote(input);
    const future = await stubProvider.quote({
      ...input,
      from: "2030-07-12", // piątek
      to: "2030-07-12",
    });
    expect(past[1].priceGr).toBe(future[0].priceGr);
  });

  it("przycina do widełek i oznacza, która granica zadziałała", async () => {
    const days = await stubProvider.quote({ ...input, maxPriceGr: 21000 });
    expect(days[1].priceGr).toBe(21000);
    expect(days[1].clampedBy).toBe("max");
    expect(days[0].clampedBy).toBeNull();
  });

  it("dolna granica też działa — obiekt nie sprzedaje poniżej progu", async () => {
    // to jest ważniejsza z dwóch granic: górna kosztuje utracony zysk,
    // dolna — sprzedaż poniżej kosztów
    const days = await stubProvider.quote({ ...input, minPriceGr: 25000 });

    expect(days.map((d) => d.priceGr)).toEqual([25000, 25000, 25000]);
    expect(days.map((d) => d.clampedBy)).toEqual(["min", "min", "min"]);
  });

  it("cena dokładnie na granicy nie jest oznaczana jako przycięta", async () => {
    // przycięcie to informacja o utraconej rekomendacji; równość niczego nie
    // traci. Widełki ustawione co do grosza na obie wyliczone ceny:
    // czwartek 200 zł (×1) i piątek 230 zł (×1,15)
    const days = await stubProvider.quote({ ...input, minPriceGr: 20000, maxPriceGr: 23000 });

    expect(days[0]).toMatchObject({ priceGr: 20000, clampedBy: null });
    expect(days[1]).toMatchObject({ priceGr: 23000, clampedBy: null });
  });

  it("podaje rynki do wyboru w panelu, z województwem do grupowania", async () => {
    // pusta lista zamyka właściciela w pętli „wybierz rynek" bez czego wybierać
    const markets = await stubProvider.markets();

    expect(markets.length).toBeGreaterThan(0);
    expect(markets.every((m) => m.id && m.name && m.voivodeship)).toBe(true);
    expect(new Set(markets.map((m) => m.id)).size).toBe(markets.length);
  });

  it("jest deterministyczny", async () => {
    const a = await stubProvider.quote(input);
    const b = await stubProvider.quote(input);
    expect(a).toEqual(b);
  });
});
