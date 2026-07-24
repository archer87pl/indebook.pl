import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "./load-messages";
import { routing } from "./routing";

const ROOT = join(__dirname, "..", "messages");

function readNs(locale: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, locale, `${ns}.json`), "utf8"));
}

/** Płaska lista kluczy („a.b.c") — porównywalna między językami. */
function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

describe("kompletność tłumaczeń", () => {
  const others = routing.locales.filter((l) => l !== routing.defaultLocale);

  for (const ns of NAMESPACES) {
    it(`namespace „${ns}" ma te same klucze we wszystkich językach`, () => {
      const base = keys(readNs(routing.defaultLocale, ns)).sort();
      expect(base.length, `${ns}: pusty słownik bazowy`).toBeGreaterThan(0);
      for (const locale of others) {
        expect(keys(readNs(locale, ns)).sort(), `${locale}/${ns}`).toEqual(base);
      }
    });
  }

  it("wartości nie są puste", () => {
    for (const locale of routing.locales) {
      for (const ns of NAMESPACES) {
        const flat = readNs(locale, ns);
        for (const key of keys(flat)) {
          const value = key
            .split(".")
            .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], flat);
          expect(String(value).trim(), `${locale}/${ns}:${key}`).not.toBe("");
        }
      }
    }
  });
});
