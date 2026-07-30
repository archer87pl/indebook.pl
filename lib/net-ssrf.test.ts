import { beforeEach, describe, expect, it, vi } from "vitest";

// Bramka SSRF na feedach iCal. Adres podaje właściciel obiektu, więc bez niej
// feed byłby sondą do sieci wewnętrznej serwera. Sprawdzenie idzie w dwóch
// krokach: sam host (gdy jest adresem IP) i wynik DNS — atakujący może wskazać
// własną, publicznie wyglądającą domenę rozwiązującą się na 127.0.0.1.
// (Sam klasyfikator adresów ma testy w net.test.ts — tutaj chodzi o bramkę.)
//
// Atrapa DNS musi być hoistowana (vi.mock, nie doMock): moduł net importujemy
// dynamicznie, ale gdyby był już wciągnięty statycznie, złapałby prawdziwy
// `lookup` i test wychodziłby w sieć.

let resolved: { address: string }[] = [];
let lookupError: Error | null = null;
const lookedUp: string[] = [];

vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => {
    lookedUp.push(host);
    if (lookupError) throw lookupError;
    return resolved;
  },
}));

const { assertPublicUrl } = await import("./net");

beforeEach(() => {
  resolved = [{ address: "93.184.216.34" }];
  lookupError = null;
  lookedUp.length = 0;
});

describe("assertPublicUrl", () => {
  it("publiczny adres przechodzi i zwraca sparsowany URL", async () => {
    const url = await assertPublicUrl("https://ical.booking.com/kalendarz.ics");

    expect(url.hostname).toBe("ical.booking.com");
    expect(lookedUp).toEqual(["ical.booking.com"]);
  });

  it("odrzuca protokoły inne niż http/https", async () => {
    // file:// czytałoby pliki serwera, ftp:// zasoby, o które nikt nie prosił
    for (const raw of ["file:///etc/passwd", "ftp://serwer/kalendarz.ics", "webcal://x/y.ics"]) {
      await expect(assertPublicUrl(raw), raw).rejects.toThrow(/http\/https/);
    }
    expect(lookedUp).toEqual([]);
  });

  it("odrzuca to, co nie jest adresem URL", async () => {
    for (const raw of ["kalendarz.ics", "", "   "]) {
      await expect(assertPublicUrl(raw), `„${raw}"`).rejects.toThrow(/Nieprawidłowy adres/);
    }
  });

  it("adres wewnętrzny podany wprost jest odrzucany bez pytania DNS", async () => {
    // sprawdzenie hosta przed lookupem oszczędza zapytanie i domyka wariant,
    // w którym DNS w ogóle nie odpowiada
    for (const raw of [
      "http://127.0.0.1/kalendarz.ics",
      "http://10.0.0.5/x.ics",
      "http://192.168.1.1/x.ics",
      "http://169.254.169.254/latest/meta-data", // metadata chmury
      "http://[::1]/x.ics",
    ]) {
      await expect(assertPublicUrl(raw), raw).rejects.toThrow(/zasób wewnętrzny/);
    }
    expect(lookedUp).toEqual([]);
  });

  it("domena rozwiązująca się na adres wewnętrzny jest odrzucana", async () => {
    // to jest właściwy atak: publicznie wyglądający host z rekordem A
    // wskazującym na loopback albo na sieć wewnętrzną chmury
    resolved = [{ address: "127.0.0.1" }];

    await expect(assertPublicUrl("https://zlosliwa-domena.pl/x.ics")).rejects.toThrow(
      /zasób wewnętrzny/
    );
  });

  it("wystarczy jeden wewnętrzny adres wśród zwróconych, żeby odrzucić", async () => {
    // host z wieloma rekordami A: przepuszczenie pozwalałoby trafić do sieci
    // wewnętrznej przy którejkolwiek kolejnej próbie połączenia
    resolved = [{ address: "93.184.216.34" }, { address: "192.168.1.10" }];

    await expect(assertPublicUrl("https://mieszana.pl/x.ics")).rejects.toThrow(
      /zasób wewnętrzny/
    );
  });

  it("nierozwiązywalny host jest odrzucany z czytelnym komunikatem", async () => {
    lookupError = new Error("ENOTFOUND");

    await expect(assertPublicUrl("https://nie-ma-takiej-domeny.xyz/x.ics")).rejects.toThrow(
      /rozwiązać adresu/
    );
  });

  it("adres IPv6 w nawiasach jest rozbierany poprawnie", async () => {
    // hostname z URL-a przychodzi w nawiasach kwadratowych; bez ich zdjęcia
    // klasyfikator nie rozpoznałby zakresu
    await expect(assertPublicUrl("http://[fd00::1]/x.ics")).rejects.toThrow(/zasób wewnętrzny/);
  });
});
