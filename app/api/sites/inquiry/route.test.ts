import { beforeEach, describe, expect, it, vi } from "vitest";

// Formularz kontaktowy stron WWW obiektów. Trasa publiczna, bez logowania:
// pułapka na boty (ukryte pole „website") ucina żądanie PRZED jakąkolwiek
// pracą i udaje sukces, żeby bot nie wiedział, że wpadł. Limit zgłoszeń jest
// per (adres IP, strona), a zapytanie idzie tylko do obiektu niezawieszonego.
// (Ścieżkę przez przeglądarkę pokrywa też e2e — tu chodzi o same bramki.)

let allowed = true;
const limitKeys: { key: string; limit: number; windowMs: number }[] = [];
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: async (key: string, limit: number, windowMs: number) => {
    limitKeys.push({ key, limit, windowMs });
    return allowed;
  },
}));

let site:
  | { property: { name: string; suspended: boolean; owner: { email: string } } }
  | null = null;
const siteQueries: Record<string, unknown>[] = [];
vi.mock("@/lib/db", () => ({
  prisma: {
    site: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        siteQueries.push(where);
        return site;
      },
    },
  },
}));

const mails: { to: string; subject: string; body: string }[] = [];
vi.mock("@/lib/mailer", () => ({
  sendMail: async (m: { to: string; subject: string; body: string }) => void mails.push(m),
}));

const { POST } = await import("./route");

const VALID = {
  siteKey: "willa",
  name: "Anna Kowalska",
  email: "anna@example.com",
  phone: "+48600100200",
  message: "Czy jest wolny pokój w sierpniu?",
};

const post = (body: unknown, ip = "1.2.3.4") =>
  POST(
    new Request("https://willa.pl/api/sites/inquiry", {
      method: "POST",
      headers: { "x-forwarded-for": ip },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  allowed = true;
  limitKeys.length = 0;
  siteQueries.length = 0;
  mails.length = 0;
  site = {
    property: { name: "Willa Pod Dębem", suspended: false, owner: { email: "wlasciciel@example.com" } },
  };
});

describe("POST /api/sites/inquiry — poprawne zgłoszenie", () => {
  it("wysyła zapytanie do właściciela obiektu", async () => {
    const res = await post(VALID);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mails[0].to).toBe("wlasciciel@example.com");
    expect(mails[0].subject).toContain("Willa Pod Dębem");
  });

  it("treść niesie dane kontaktowe gościa, żeby właściciel mógł odpowiedzieć", async () => {
    await post(VALID);

    expect(mails[0].body).toContain("anna@example.com");
    expect(mails[0].body).toContain("+48600100200");
    expect(mails[0].body).toContain("Czy jest wolny pokój w sierpniu?");
  });

  it("telefon jest nieobowiązkowy", async () => {
    const res = await post({ ...VALID, phone: "" });

    expect(res.status).toBe(200);
    expect(mails).toHaveLength(1);
  });

  it("stronę znajduje po subdomenie ALBO domenie własnej", async () => {
    // ten sam formularz działa pod willa.rezflow.pl i pod willa.pl
    await post(VALID);

    expect(JSON.stringify(siteQueries[0])).toContain("subdomain");
    expect(JSON.stringify(siteQueries[0])).toContain("customDomain");
  });
});

describe("pułapka na boty", () => {
  it("wypełnione ukryte pole udaje sukces i nie wysyła maila", async () => {
    // odpowiedź jest identyczna jak przy sukcesie — bot nie ma się dowiedzieć,
    // że został odsiany
    const res = await post({ ...VALID, website: "https://spam.example" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mails).toEqual([]);
  });

  it("ucina żądanie PRZED limiterem i przed pytaniem bazy", async () => {
    // bot nie może zużywać puli limitu prawdziwych gości ani generować
    // zapytań do bazy przy każdym strzale
    await post({ ...VALID, website: "cokolwiek" });

    expect(limitKeys).toEqual([]);
    expect(siteQueries).toEqual([]);
  });
});

describe("limit zgłoszeń", () => {
  it("licznik jest per adres IP i per strona", async () => {
    // wspólny licznik dla całej platformy pozwoliłby jednemu spamerowi
    // zablokować formularze wszystkich obiektów
    await post(VALID, "9.9.9.9");

    expect(limitKeys[0].key).toBe("inquiry:9.9.9.9:willa");
    expect(limitKeys[0].limit).toBe(5);
    expect(limitKeys[0].windowMs).toBe(10 * 60_000);
  });

  it("przekroczony limit odrzuca żądanie i nie wysyła maila", async () => {
    allowed = false;

    const res = await post(VALID);

    expect(res.status).toBe(429);
    expect(mails).toEqual([]);
  });

  it("adres IP bierze z nagłówka proxy, pierwszy z listy", async () => {
    await post(VALID, "203.0.113.7, 10.0.0.1");

    expect(limitKeys[0].key).toContain("203.0.113.7");
  });
});

describe("walidacja i stan obiektu", () => {
  it("odrzuca niepoprawny e-mail", async () => {
    for (const email of ["", "anna", "anna@", "a b@example.pl"]) {
      const res = await post({ ...VALID, email });
      expect(res.status, `email=${email}`).toBe(400);
    }
    expect(mails).toEqual([]);
  });

  it("odrzuca brak imienia i wiadomość poniżej 10 znaków", async () => {
    expect((await post({ ...VALID, name: "" })).status).toBe(400);
    expect((await post({ ...VALID, message: "krótka" })).status).toBe(400);
    expect((await post({ ...VALID, message: "   " })).status).toBe(400);
    expect(mails).toEqual([]);
  });

  it("odrzuca wiadomość dłuższą niż 2000 znaków", async () => {
    expect((await post({ ...VALID, message: "x".repeat(2001) })).status).toBe(400);
  });

  it("przycina nadmiarowo długie imię, e-mail i telefon", async () => {
    // pola idą do treści maila — bez limitu jedno zgłoszenie mogłoby
    // rozdmuchać wiadomość do dowolnego rozmiaru
    await post({ ...VALID, name: "A".repeat(300) });

    expect(mails[0].body).not.toContain("A".repeat(200));
  });

  it("nieznana strona to 404, bez wysyłki", async () => {
    site = null;

    const res = await post({ ...VALID, siteKey: "nie-ma-takiej" });

    expect(res.status).toBe(404);
    expect(mails).toEqual([]);
  });

  it("obiekt zawieszony nie przyjmuje zapytań", async () => {
    site!.property.suspended = true;

    const res = await post(VALID);

    expect(res.status).toBe(404);
    expect(mails).toEqual([]);
  });

  it("treść, która nie jest JSON-em, to 400 zamiast wywrotki", async () => {
    const res = await post("to nie jest json");

    expect(res.status).toBe(400);
    expect(mails).toEqual([]);
  });
});
