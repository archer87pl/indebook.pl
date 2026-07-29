import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePhone, sendSms } from "./sms";

let settings: Record<string, string> = {};
const events: { kind: string; level?: string; message: string; meta?: string }[] = [];

vi.mock("./settings", () => ({ getSetting: async (key: string) => settings[key] ?? "" }));
vi.mock("./log", () => ({
  logEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
}));

describe("normalizePhone", () => {
  it("polski numer 9-cyfrowy dostaje prefiks +48", () => {
    expect(normalizePhone("600100200")).toBe("+48600100200");
    expect(normalizePhone("600 100 200")).toBe("+48600100200");
    expect(normalizePhone("600-100-200")).toBe("+48600100200");
  });

  it("prefiksy międzynarodowe: +, 00 i gołe 48", () => {
    expect(normalizePhone("+48 600 100 200")).toBe("+48600100200");
    expect(normalizePhone("0048600100200")).toBe("+48600100200");
    expect(normalizePhone("48600100200")).toBe("+48600100200");
    expect(normalizePhone("+49 170 1234567")).toBe("+491701234567");
  });

  it("odrzuca numery nienadające się do wysyłki", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("brak telefonu")).toBeNull();
    expect(normalizePhone("600100200300400")).toBeNull();
  });
});

// SMS-y wychodzą w środku rezerwacji i przypomnień z crona. Bez tokenu mają
// trafiać do konsoli i NIE udawać wysłanych; z tokenem — zostawiać ślad
// niezależnie od tego, jak skończyła się rozmowa z SMSAPI. Awaria bramki
// nie może przewrócić operacji, w której trakcie jest wołana.
describe("sendSms", () => {
  const SMS = { to: "600100200", body: "Rezerwacja HO-ABC123 potwierdzona." };

  const okResponse = () =>
    vi.fn(async () => new Response(JSON.stringify({ count: 1 }), { status: 200 }));

  beforeEach(() => {
    settings = {};
    events.length = 0;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("numer nie do wysyłki kończy sprawę przed pytaniem o token", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendSms({ ...SMS, to: "brak" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it("bez tokenu pisze na konsolę i nie zapisuje zdarzenia wysyłki", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendSms(SMS);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events).toEqual([]);
    expect(console.log).toHaveBeenCalled();
  });

  it("z tokenem wysyła znormalizowany numer i treść do SMSAPI", async () => {
    settings = { SMSAPI_TOKEN: "token-testowy" };
    const fetchMock = okResponse();
    vi.stubGlobal("fetch", fetchMock);

    await sendSms(SMS);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.smsapi.pl/sms.do");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-testowy");

    const form = new URLSearchParams(init.body as string);
    expect(form.get("to")).toBe("+48600100200"); // nie surowe „600100200"
    expect(form.get("message")).toBe(SMS.body);
    expect(form.get("from")).toBe("ECO"); // domyślny nadawca ekonomiczny
  });

  it("zarejestrowane pole nadawcy z panelu wygrywa z domyślnym", async () => {
    settings = { SMSAPI_TOKEN: "token-testowy", SMS_FROM: "RezFlow" };
    const fetchMock = okResponse();
    vi.stubGlobal("fetch", fetchMock);

    await sendSms(SMS);

    const form = new URLSearchParams(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string
    );
    expect(form.get("from")).toBe("RezFlow");
  });

  it("udana wysyłka zostawia wpis z numerem odbiorcy", async () => {
    settings = { SMSAPI_TOKEN: "token-testowy" };
    vi.stubGlobal("fetch", okResponse());

    await sendSms(SMS);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "SMS", message: "Wysłano SMS" });
    expect(events[0].level).toBeUndefined();
    expect(events[0].meta).toContain("+48600100200");
  });

  it("błąd w treści odpowiedzi jest błędem, mimo statusu 200", async () => {
    // SMSAPI oddaje 200 z polem `error` — bez tego sprawdzenia nieudana
    // wysyłka wyglądałaby w dzienniku na udaną
    settings = { SMSAPI_TOKEN: "token-testowy" };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 101, message: "Niepoprawny token" }), {
            status: 200,
          })
      )
    );

    await sendSms(SMS);

    expect(events[0]).toMatchObject({ kind: "SMS", level: "ERROR" });
    expect(events[0].message).toContain("101");
    expect(events[0].meta).toContain("Niepoprawny token");
  });

  it("odmowa HTTP kończy się wpisem ERROR", async () => {
    settings = { SMSAPI_TOKEN: "token-testowy" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));

    await sendSms(SMS);

    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].message).toContain("401");
  });

  it("padnięta sieć nie przewraca operacji biznesowej", async () => {
    settings = { SMSAPI_TOKEN: "token-testowy" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      })
    );

    await expect(sendSms(SMS)).resolves.toBeUndefined();

    expect(events[0]).toMatchObject({ level: "ERROR" });
    expect(events[0].meta).toContain("ETIMEDOUT");
  });
});
