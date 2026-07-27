import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AMENITIES, amenityDef, parseAmenities } from "./amenities";

const LOCALES = ["pl", "en", "de"] as const;
const ROOT = join(__dirname, "..");

function amenityLabels(locale: string): Record<string, string> {
  const path = join(ROOT, "messages", locale, "common.json");
  return (JSON.parse(readFileSync(path, "utf8")) as { amenities: Record<string, string> })
    .amenities;
}

describe("parseAmenities", () => {
  it("przepuszcza znane klucze", () => {
    expect(parseAmenities('["wifi","parking"]')).toEqual(["wifi", "parking"]);
  });

  it("odrzuca nieznane klucze i śmieci", () => {
    expect(parseAmenities('["wifi","nie-ma-takiego"]')).toEqual(["wifi"]);
    expect(parseAmenities("{}")).toEqual([]);
    expect(parseAmenities("to nie jest JSON")).toEqual([]);
  });
});

describe("słowniki udogodnień", () => {
  it.each(LOCALES)("%s tłumaczy każde udogodnienie z katalogu", (locale) => {
    const labels = amenityLabels(locale);
    const missing = AMENITIES.filter((a) => !labels[a.key]).map((a) => a.key);
    expect(missing, `brakuje w ${locale}: ${missing.join(", ")}`).toEqual([]);
  });

  it.each(LOCALES)("%s nie ma tłumaczeń dla nieistniejących kluczy", (locale) => {
    // martwy wpis w słowniku znaczy, że ktoś usunął udogodnienie i zapomniał o katalogu
    const orphans = Object.keys(amenityLabels(locale)).filter((key) => !amenityDef(key));
    expect(orphans, `osierocone w ${locale}: ${orphans.join(", ")}`).toEqual([]);
  });

  it("tłumaczenia faktycznie się różnią między językami", () => {
    // „TV" jest takie samo wszędzie, ale klimatyzacja już nie
    const ac = LOCALES.map((l) => amenityLabels(l).ac);
    expect(new Set(ac).size).toBe(3);
  });

  it("żaden język nie ma pustej etykiety", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(amenityLabels(locale))) {
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
      }
    }
  });
});

describe("powierzchnie gościa nie pokazują polskiej etykiety z katalogu", () => {
  // regresja: AMENITIES.label jest po polsku i służy panelowi recepcji;
  // na stronie po niemiecku dawał „Klimatyzacja" obok niemieckiego interfejsu
  function tsxFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) tsxFiles(full, acc);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  it.each([["app/[locale]"], ["components/site"]])("%s", (dir) => {
    const offenders: string[] = [];
    for (const file of tsxFiles(join(ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      if (!/\bAMENITIES\b/.test(source)) continue;
      // odwołanie do .label w pliku, który operuje na katalogu udogodnień
      if (/\.label\b/.test(source)) offenders.push(file.slice(ROOT.length + 1));
    }
    expect(offenders, `użyj common.amenities.<key>: ${offenders.join(", ")}`).toEqual([]);
  });
});
