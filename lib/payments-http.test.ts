import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Reservation } from "@prisma/client";
import { createP24Payment, testP24Access, verifyP24Transaction } from "./payments";

// Rozmowa z Przelewy24: rejestracja zaliczki i potwierdzenie transakcji.
// Konfiguracja jest PER OBIEKT (właściciel podpina własne konto), więc każde
// żądanie musi lecieć na jego dane — pomyłka oznaczałaby przelew na cudze
// konto. Podpis i uwierzytelnienie liczą się z klucza tego samego obiektu.
// (p24Config i weryfikacja podpisu powiadomienia mają testy w payments.test.ts.)

const SANDBOX = {
  p24MerchantId: "12345",
  p24PosId: "12345",
  p24ApiKey: "klucz-api-p24",
  p24Crc: "crc-obiektu",
  p24Sandbox: true,
  name: "Willa Pod Dębem",
};

const PROD = { ...SANDBOX, p24Sandbox: false };

const RESERVATION = {
  code: "HO-ABC123",
  depositGr: 36000,
  email: "gosc@example.com",
  guestName: "Anna Kowalska",
} as unknown as Reservation;

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

function respond(body: unknown, init: ResponseInit = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, requestInit: RequestInit) => {
      calls.push({ url, init: requestInit });
      return new Response(typeof body === "string" ? body : JSON.stringify(body), init);
    })
  );
}

const bodyOf = (call: Call) => JSON.parse(call.init.body as string);
const authOf = (call: Call) => (call.init.headers as Record<string, string>).Authorization;

beforeEach(() => {
  calls = [];
  vi.stubEnv("APP_URL", "https://rezflow.pl");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("createP24Payment", () => {
  it("rejestruje zaliczkę i oddaje adres bramki z otrzymanym tokenem", async () => {
    respond({ data: { token: "tok-123" } });

    const url = await createP24Payment(RESERVATION, SANDBOX);

    expect(calls[0].url).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/register");
    expect(url).toBe("https://sandbox.przelewy24.pl/trnRequest/tok-123");
  });

  it("na produkcji uderza w bramkę produkcyjną, nie w piaskownicę", async () => {
    // pomyłka w tę stronę oznacza rezerwacje „opłacone" testowymi pieniędzmi
    respond({ data: { token: "tok-123" } });

    const url = await createP24Payment(RESERVATION, PROD);

    expect(calls[0].url).toBe("https://secure.przelewy24.pl/api/v1/transaction/register");
    expect(url).toContain("https://secure.przelewy24.pl/");
  });

  it("wysyła kwotę zaliczki w groszach i kod rezerwacji jako identyfikator sesji", async () => {
    // sessionId wraca w powiadomieniu i po nim odnajdujemy rezerwację
    respond({ data: { token: "tok-123" } });

    await createP24Payment(RESERVATION, SANDBOX);

    expect(bodyOf(calls[0])).toMatchObject({
      sessionId: "HO-ABC123",
      amount: 36000,
      currency: "PLN",
      email: "gosc@example.com",
      client: "Anna Kowalska",
      merchantId: 12345,
      posId: 12345,
    });
  });

  it("adres powiadomienia wskazuje nasz webhook, a powrotu — panel gościa", async () => {
    respond({ data: { token: "tok-123" } });

    await createP24Payment(RESERVATION, SANDBOX);

    expect(bodyOf(calls[0]).urlStatus).toBe("https://rezflow.pl/api/payments/p24");
    expect(bodyOf(calls[0]).urlReturn).toBe("https://rezflow.pl/r/HO-ABC123?paid=1");
  });

  it("podpis jest liczony z kluczem CRC obiektu i zmienia się z kwotą", async () => {
    respond({ data: { token: "tok-123" } });
    await createP24Payment(RESERVATION, SANDBOX);
    const signA = bodyOf(calls[0]).sign;

    calls = [];
    respond({ data: { token: "tok-123" } });
    await createP24Payment({ ...RESERVATION, depositGr: 36001 } as Reservation, SANDBOX);
    const signB = bodyOf(calls[0]).sign;

    calls = [];
    respond({ data: { token: "tok-123" } });
    await createP24Payment(RESERVATION, { ...SANDBOX, p24Crc: "inny-crc" });
    const signC = bodyOf(calls[0]).sign;

    expect(signA).toMatch(/^[0-9a-f]{96}$/); // sha384
    expect(signB).not.toBe(signA);
    expect(signC).not.toBe(signA);
  });

  it("uwierzytelnia się identyfikatorem punktu i kluczem API obiektu", async () => {
    respond({ data: { token: "tok-123" } });

    await createP24Payment(RESERVATION, SANDBOX);

    const decoded = Buffer.from(authOf(calls[0]).replace("Basic ", ""), "base64").toString();
    expect(decoded).toBe("12345:klucz-api-p24");
  });

  it("żądanie ma limit czasu — gość nie może wisieć na bramce", async () => {
    respond({ data: { token: "tok-123" } });

    await createP24Payment(RESERVATION, SANDBOX);

    expect(calls[0].init.signal).toBeDefined();
  });

  it("bez konfiguracji P24 nie wysyła niczego i mówi wprost, czego brakuje", async () => {
    respond({ data: { token: "tok-123" } });

    await expect(
      createP24Payment(RESERVATION, { ...SANDBOX, p24ApiKey: "" })
    ).rejects.toThrow(/P24 nie jest skonfigurowane/);
    expect(calls).toEqual([]);
  });

  it("odpowiedź bez tokenu jest błędem — nie ma gdzie przekierować gościa", async () => {
    respond({ error: "Nieprawidłowe dane sprzedawcy" }, { status: 401 });

    await expect(createP24Payment(RESERVATION, SANDBOX)).rejects.toThrow(
      /Nieprawidłowe dane sprzedawcy/
    );
  });

  it("status 200 bez tokenu też jest błędem", async () => {
    // gdyby przechodził, gość dostałby adres bramki z „undefined" w środku
    respond({ data: {} });

    await expect(createP24Payment(RESERVATION, SANDBOX)).rejects.toThrow(/P24 register/);
  });
});

describe("verifyP24Transaction", () => {
  const NOTIFICATION = {
    sessionId: "HO-ABC123",
    amount: 36000,
    currency: "PLN",
    orderId: 987654,
  } as never;

  it("potwierdza transakcję metodą PUT — bez tego środki nie są księgowane", async () => {
    respond({ data: { status: "success" } });

    expect(await verifyP24Transaction(NOTIFICATION, SANDBOX)).toBe(true);
    expect(calls[0].url).toBe("https://sandbox.przelewy24.pl/api/v1/transaction/verify");
    expect(calls[0].init.method).toBe("PUT");
  });

  it("wysyła dokładnie te dane, które przyszły w powiadomieniu", async () => {
    // podmiana czegokolwiek tutaj rozjechałaby podpis i P24 by odmówił
    respond({});

    await verifyP24Transaction(NOTIFICATION, SANDBOX);

    expect(bodyOf(calls[0])).toMatchObject({
      sessionId: "HO-ABC123",
      amount: 36000,
      currency: "PLN",
      orderId: 987654,
    });
    expect(bodyOf(calls[0]).sign).toMatch(/^[0-9a-f]{96}$/);
  });

  it("odmowa operatora daje false, a nie wyjątek", async () => {
    respond({ error: "sign mismatch" }, { status: 400 });

    expect(await verifyP24Transaction(NOTIFICATION, SANDBOX)).toBe(false);
  });

  it("bez konfiguracji P24 nie potwierdza i nie dzwoni nigdzie", async () => {
    respond({});

    expect(await verifyP24Transaction(NOTIFICATION, { ...SANDBOX, p24Crc: "" })).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("testP24Access", () => {
  it("sprawdza dane dostępowe na właściwym środowisku", async () => {
    respond({ data: true });

    expect(await testP24Access(PROD)).toBe(true);
    expect(calls[0].url).toBe("https://secure.przelewy24.pl/api/v1/testAccess");
  });

  it("złe dane dostępowe dają false", async () => {
    respond("", { status: 401 });
    expect(await testP24Access(SANDBOX)).toBe(false);
  });

  it("padnięta sieć daje false, a nie wyjątek w panelu konfiguracji", async () => {
    // to jest przycisk „sprawdź połączenie" — musi oddać wynik, nie 500
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ETIMEDOUT");
      })
    );

    expect(await testP24Access(SANDBOX)).toBe(false);
  });

  it("niepełna konfiguracja daje false bez zapytania", async () => {
    respond({ data: true });

    expect(await testP24Access({ ...SANDBOX, p24PosId: "" })).toBe(false);
    expect(calls).toEqual([]);
  });
});
