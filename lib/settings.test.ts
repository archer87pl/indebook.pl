import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Konfiguracja platformy ma dwa źródła: panel superadmina (baza) i zmienne
// środowiskowe. Pierwszeństwo bazy jest istotą tego modułu — właściciel
// platformy musi móc podmienić klucz bez redeployu.

let dbRows: { key: string; value: string }[] = [];

vi.mock("./db", () => ({
  prisma: { platformSetting: { findMany: async () => dbRows } },
}));

// getDbSettings jest opakowane w react cache(); bez tego memoizacja trzymałaby
// pierwszy odczyt na wszystkie testy
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const {
  KNOWN_SETTING_KEYS,
  SETTING_SECTIONS,
  getSetting,
  maskSecret,
  settingSource,
} = await import("./settings");

beforeEach(() => {
  dbRows = [];
});

afterEach(() => vi.unstubAllEnvs());

describe("getSetting", () => {
  it("wartość z panelu wygrywa ze zmienną środowiskową", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_ze_srodowiska");
    dbRows = [{ key: "RESEND_API_KEY", value: "re_z_panelu" }];

    expect(await getSetting("RESEND_API_KEY")).toBe("re_z_panelu");
  });

  it("bez wpisu w bazie schodzi do zmiennej środowiskowej", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_ze_srodowiska");
    expect(await getSetting("RESEND_API_KEY")).toBe("re_ze_srodowiska");
  });

  it("brak obu źródeł daje pusty napis, nie undefined", async () => {
    // wołający sprawdzają `if (!apiKey)`, więc undefined psułoby porównania
    expect(await getSetting("NIE_MA_TAKIEGO_KLUCZA")).toBe("");
  });

  it("celowo wyczyszczona wartość w panelu przykrywa zmienną środowiskową", async () => {
    // superadmin kasuje klucz w panelu, żeby wyłączyć integrację — nie może
    // wtedy odżyć stary klucz z ENV
    vi.stubEnv("SMSAPI_TOKEN", "token-ze-srodowiska");
    dbRows = [{ key: "SMSAPI_TOKEN", value: "" }];

    expect(await getSetting("SMSAPI_TOKEN")).toBe("");
  });
});

describe("settingSource", () => {
  it("rozpoznaje panel, środowisko i brak konfiguracji", async () => {
    vi.stubEnv("EMAIL_FROM", "z-env@example.com");
    dbRows = [{ key: "RESEND_API_KEY", value: "re_x" }];

    expect(await settingSource("RESEND_API_KEY")).toBe("panel");
    expect(await settingSource("EMAIL_FROM")).toBe("env");
    expect(await settingSource("SMSAPI_TOKEN")).toBeNull();
  });

  it("pusty wpis w panelu nie liczy się jako źródło", async () => {
    dbRows = [{ key: "SMSAPI_TOKEN", value: "" }];
    expect(await settingSource("SMSAPI_TOKEN")).toBeNull();
  });
});

describe("maskSecret", () => {
  it("pokazuje wyłącznie cztery ostatnie znaki", () => {
    expect(maskSecret("re_bardzo_tajny_klucz_9f3a")).toBe("••••9f3a");
  });

  it("pusta wartość nie produkuje samych kropek", () => {
    // „••••" przy braku klucza sugerowałoby, że coś jest ustawione
    expect(maskSecret("")).toBe("");
  });

  it("krótki sekret nie ujawnia się w całości przez przypadek", () => {
    expect(maskSecret("abc")).toBe("••••abc");
  });
});

describe("definicje sekcji", () => {
  it("KNOWN_SETTING_KEYS zawiera każde pole z każdej sekcji", () => {
    const fromSections = SETTING_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    expect(KNOWN_SETTING_KEYS).toEqual(fromSections);
  });

  it("klucze się nie powtarzają między sekcjami", () => {
    // duplikat oznaczałby, że dwa pola panelu zapisują w to samo miejsce
    expect(new Set(KNOWN_SETTING_KEYS).size).toBe(KNOWN_SETTING_KEYS.length);
  });

  it("każdy klucz wymagany do „skonfigurowano” istnieje wśród pól sekcji", () => {
    for (const section of SETTING_SECTIONS) {
      const fields = section.fields.map((f) => f.key);
      for (const required of section.requiredKeys) {
        expect(fields, `sekcja ${section.id}`).toContain(required);
      }
    }
  });

  it("sekrety są oznaczone, żeby UI ich nie prefillował", () => {
    const secrets = SETTING_SECTIONS.flatMap((s) => s.fields)
      .filter((f) => f.secret)
      .map((f) => f.key);
    expect(secrets).toEqual(["RESEND_API_KEY", "SMSAPI_TOKEN"]);
  });
});
