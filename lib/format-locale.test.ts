import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatMoney, formatPln } from "./format";
import { formatDate, formatDatePl, formatDateShort, formatRangeShort } from "./dates";

describe("formatMoney", () => {
  it("waluta zostaje złotówkowa, zmienia się tylko zapis", () => {
    // obiekt rozlicza się w PLN niezależnie od języka gościa
    for (const locale of ["pl", "en", "de"]) {
      expect(formatMoney(123400, locale)).toMatch(/PLN|zł/);
    }
  });

  it("każdy język ma swój zapis kwoty", () => {
    const pl = formatMoney(123400, "pl");
    const en = formatMoney(123400, "en");
    const de = formatMoney(123400, "de");
    expect(new Set([pl, en, de]).size).toBe(3);
  });

  it("separator dziesiętny i grupujący idą za językiem", () => {
    expect(formatMoney(123456, "de")).toContain("1.234,56");
    expect(formatMoney(123456, "en")).toContain("1,234.56");
  });

  it("końcowe zero groszy jest obcinane w każdym języku", () => {
    // celowe: cennik pokazuje „350 zł", nie „350,00 zł"
    expect(formatMoney(35000, "pl")).not.toContain(",00");
    expect(formatMoney(35000, "en")).not.toContain(".00");
  });

  it("formatPln zostaje polskim skrótem dla panelu i faktur", () => {
    expect(formatPln(123400)).toBe(formatMoney(123400, "pl-PL"));
  });
});

describe("formatowanie dat per język", () => {
  const iso = "2027-08-14";

  it("miesiąc słownie w języku gościa", () => {
    expect(formatDate(iso, "pl")).toContain("sierpnia");
    expect(formatDate(iso, "en")).toContain("August");
    expect(formatDate(iso, "de")).toContain("August");
    expect(formatDate(iso, "pl")).not.toBe(formatDate(iso, "en"));
  });

  it("zapis liczbowy idzie za językiem", () => {
    // en-US odwraca kolejność dnia i miesiąca — to nie jest kosmetyka
    expect(formatDateShort(iso, "en-US")).toBe("08/14/2027");
    expect(formatDateShort(iso, "pl")).toBe("14.08.2027");
  });

  it("zakres pobytu skraca miesiąc w języku gościa", () => {
    const de = formatRangeShort("2027-06-30", "2027-07-02", "de");
    const pl = formatRangeShort("2027-06-30", "2027-07-02", "pl");
    expect(de).not.toBe(pl);
    expect(pl).toContain("cze");
  });

  it("formatDatePl zostaje polskim skrótem", () => {
    expect(formatDatePl(iso)).toBe(formatDate(iso, "pl-PL"));
  });

  it("nie gubi doby przy zmianie strefy — data jest kalendarzowa, nie chwilą", () => {
    expect(formatDateShort("2027-01-01", "pl")).toBe("01.01.2027");
    expect(formatDateShort("2027-12-31", "pl")).toBe("31.12.2027");
  });
});

describe("powierzchnie gościa nie używają polskich formatterów", () => {
  // regresja: formatPln/formatDatePl na stronie po niemiecku dawały gościowi
  // „1 234,00 zł" i „14 sierpnia 2027" mimo niemieckiego interfejsu
  const ROOT = join(__dirname, "..");
  const FORBIDDEN = ["formatPln", "formatDatePl", "formatRangeShortPl", "formatDateShortPl"];

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
      for (const name of FORBIDDEN) {
        // granica słowa, żeby formatDatePl nie łapało się jako formatDate
        if (new RegExp(`\\b${name}\\b`).test(source)) {
          offenders.push(`${file.slice(ROOT.length + 1)} → ${name}`);
        }
      }
    }
    expect(offenders, `użyj wersji z językiem: ${offenders.join(", ")}`).toEqual([]);
  });
});
