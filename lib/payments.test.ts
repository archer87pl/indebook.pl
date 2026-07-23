import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type P24Notification,
  p24Config,
  p24Configured,
  verifyP24NotificationSign,
} from "./payments";

// Pola P24 obiektu (Property.p24*) — komplet danych produkcyjnych klienta.
const fields = {
  p24MerchantId: "184512",
  p24PosId: "184512",
  p24ApiKey: "sekretny-klucz-api",
  p24Crc: "a1b2c3d4e5f6",
  p24Sandbox: true,
};

describe("p24Config", () => {
  it("komplet danych daje konfigurację sandbox z liczbowymi identyfikatorami", () => {
    const cfg = p24Config(fields);
    expect(cfg).not.toBeNull();
    expect(cfg!.merchantId).toBe(184512);
    expect(cfg!.posId).toBe(184512);
    expect(cfg!.baseUrl).toBe("https://sandbox.przelewy24.pl");
  });

  it("wyłączony sandbox przełącza na środowisko produkcyjne", () => {
    const cfg = p24Config({ ...fields, p24Sandbox: false });
    expect(cfg!.baseUrl).toBe("https://secure.przelewy24.pl");
  });

  it("brak dowolnego pola oznacza brak konfiguracji (tryb symulacji)", () => {
    expect(p24Config({ ...fields, p24MerchantId: "" })).toBeNull();
    expect(p24Config({ ...fields, p24PosId: "" })).toBeNull();
    expect(p24Config({ ...fields, p24ApiKey: "" })).toBeNull();
    expect(p24Config({ ...fields, p24Crc: "" })).toBeNull();
    expect(p24Configured({ ...fields, p24Crc: "" })).toBe(false);
    expect(p24Configured(fields)).toBe(true);
  });

  it("nieliczbowy Merchant ID / POS ID nie przechodzi", () => {
    expect(p24Config({ ...fields, p24MerchantId: "abc" })).toBeNull();
    expect(p24Config({ ...fields, p24PosId: "12 34" })).toBeNull();
  });
});

describe("verifyP24NotificationSign", () => {
  // Podpis wg dokumentacji P24: sha384 z JSON pól powiadomienia + crc,
  // w kolejności: merchantId, posId, sessionId, amount, originAmount,
  // currency, orderId, methodId, statement, crc.
  const notification = (over: Partial<P24Notification> = {}): P24Notification => {
    const base = {
      merchantId: 184512,
      posId: 184512,
      sessionId: "RZ-TEST-001",
      amount: 30000,
      originAmount: 30000,
      currency: "PLN",
      orderId: 987654,
      methodId: 154,
      statement: "p24-RZ-TEST-001",
    };
    const sign = createHash("sha384")
      .update(JSON.stringify({ ...base, crc: fields.p24Crc }))
      .digest("hex");
    return { ...base, sign, ...over };
  };

  it("akceptuje powiadomienie z poprawnym podpisem", () => {
    expect(verifyP24NotificationSign(notification(), fields)).toBe(true);
  });

  it("odrzuca powiadomienie ze zmanipulowaną kwotą", () => {
    expect(
      verifyP24NotificationSign(notification({ amount: 100 }), fields)
    ).toBe(false);
  });

  it("odrzuca powiadomienie, gdy obiekt nie ma konfiguracji P24", () => {
    expect(
      verifyP24NotificationSign(notification(), { ...fields, p24Crc: "" })
    ).toBe(false);
  });
});
