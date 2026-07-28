import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "./load-messages";
import { routing } from "./routing";

// Parity w messages.test.ts porównuje języki MIĘDZY SOBĄ, więc klucz, którego
// nie ma w żadnym z nich, przechodzi niezauważony — a gość zobaczy wtedy
// dosłowną ścieżkę klucza zamiast zdania. Ten plik wiąże słowniki z kodem:
// co jest używane, musi istnieć, a co istnieje, powinno być używane.

const ROOT = join(__dirname, "..");
const MESSAGES = join(ROOT, "messages");
const SCANNED_DIRS = ["app", "components", "lib", "i18n"];

function readNs(locale: string, ns: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES, locale, `${ns}.json`), "utf8"));
}

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

type Usage = { ns: string; key: string; file: string; dynamic: boolean };

/**
 * Wyciąga użycia tłumaczeń z jednego pliku. Najpierw szuka, do jakiej zmiennej
 * przypisano którą przestrzeń nazw, potem wywołań tej zmiennej.
 *
 * Klucze budowane dynamicznie (`t(\`errors.${code}\`)`) rozpoznajemy po
 * statycznym prefiksie — inaczej cała rodzina `errors.*` wyglądałaby na
 * nieużywaną.
 */
/**
 * Opakowania, które zwracają gotowy tłumacz przypięty do przestrzeni nazw.
 * Skaner nie wnioskuje tego z typów, więc wymieniamy je wprost — inaczej cała
 * przestrzeń `email` wyglądałaby na nieużywaną.
 */
const WRAPPERS: Record<string, string> = { guestT: "email" };

function usagesIn(file: string): Usage[] {
  const source = readFileSync(file, "utf8");
  const bindings = new Map<string, string>();

  for (const [wrapper, ns] of Object.entries(WRAPPERS)) {
    for (const m of source.matchAll(
      new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*(?:await\\s+)?${wrapper}\\(`, "g")
    )) {
      bindings.set(m[1], ns);
    }
  }

  // const t = await getTranslations("nav") / useTranslations("nav")
  for (const m of source.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*"([\w-]+)"\s*\)/g
  )) {
    bindings.set(m[1], m[2]);
  }
  // const t = await getTranslations({ locale, namespace: "site" })
  for (const m of source.matchAll(
    /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?getTranslations\(\s*\{[^}]*namespace:\s*"([\w-]+)"/g
  )) {
    bindings.set(m[1], m[2]);
  }

  const usages: Usage[] = [];
  for (const [variable, ns] of bindings) {
    // t("a.b"), t(`a.${x}`) oraz t.rich("a.b") — wariant z szablonem zostawia
    // sam statyczny prefiks
    const call = new RegExp(
      `\\b${variable}(?:\\.rich)?\\(\\s*(?:"([^"]+)"|\`([^\`]*)\`)`,
      "g"
    );
    for (const m of source.matchAll(call)) {
      if (m[1] !== undefined) {
        usages.push({ ns, key: m[1], file, dynamic: false });
      } else {
        const prefix = (m[2] ?? "").split("$")[0].replace(/\.$/, "");
        if (prefix) usages.push({ ns, key: prefix, file, dynamic: true });
      }
    }
  }
  return usages;
}

const allUsages = SCANNED_DIRS.flatMap((dir) => sourceFiles(join(ROOT, dir))).flatMap(usagesIn);
const catalog = new Map<string, string[]>(
  NAMESPACES.map((ns) => [ns, keys(readNs(routing.defaultLocale, ns))])
);

describe("słowniki kontra kod", () => {
  it("znajduje użycia tłumaczeń — inaczej ten plik testowałby pustkę", () => {
    expect(allUsages.length).toBeGreaterThan(50);
    expect(new Set(allUsages.map((u) => u.ns)).size).toBeGreaterThan(3);
  });

  it("każdy klucz użyty w kodzie istnieje w słowniku", () => {
    const missing = allUsages
      .filter((u) => !u.dynamic)
      .filter((u) => !(catalog.get(u.ns) ?? []).includes(u.key))
      .map((u) => `${u.ns}:${u.key} (${u.file.slice(ROOT.length + 1)})`);

    expect([...new Set(missing)], "brak w słowniku PL").toEqual([]);
  });

  it("klucz budowany dynamicznie ma w słowniku całą rodzinę", () => {
    const missing = allUsages
      .filter((u) => u.dynamic)
      .filter((u) => !(catalog.get(u.ns) ?? []).some((k) => k.startsWith(`${u.key}.`)))
      .map((u) => `${u.ns}:${u.key}.* (${u.file.slice(ROOT.length + 1)})`);

    expect([...new Set(missing)], "brak rodziny kluczy").toEqual([]);
  });

  it("w słownikach nie ma osieroconych kluczy", () => {
    // martwe tłumaczenie to koszt: trzeba je utrzymywać w trzech językach
    const used = new Set(allUsages.filter((u) => !u.dynamic).map((u) => `${u.ns}:${u.key}`));
    const dynamicPrefixes = allUsages
      .filter((u) => u.dynamic)
      .map((u) => `${u.ns}:${u.key}.`);

    const orphans: string[] = [];
    for (const [ns, list] of catalog) {
      for (const key of list) {
        const full = `${ns}:${key}`;
        if (used.has(full)) continue;
        if (dynamicPrefixes.some((p) => full.startsWith(p))) continue;
        orphans.push(full);
      }
    }
    expect(orphans, "klucze bez użycia w kodzie").toEqual([]);
  });
});

describe("spójność wstawek ICU", () => {
  const others = routing.locales.filter((l) => l !== routing.defaultLocale);

  /**
   * Nazwy argumentów ICU z POZIOMU ZEROWEGO. Naiwne wyrażenie regularne
   * łapałoby też treść gałęzi liczby mnogiej (`one {Pozostały gość}`) i każdy
   * język wyglądałby na rozjechany, bo te słowa są z definicji różne.
   */
  function placeholders(value: string): string[] {
    const names: string[] = [];
    let depth = 0;
    for (let i = 0; i < value.length; i++) {
      if (value[i] === "}") depth--;
      else if (value[i] === "{") {
        if (depth === 0) {
          const name = /^\s*(\w+)/.exec(value.slice(i + 1))?.[1];
          if (name) names.push(name);
        }
        depth++;
      }
    }
    return names.sort();
  }

  function leafValue(flat: Record<string, unknown>, key: string): unknown {
    return key
      .split(".")
      .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], flat);
  }

  it.each(others)("%s używa tych samych wstawek co polski", (locale) => {
    const mismatches: string[] = [];
    for (const ns of NAMESPACES) {
      const base = readNs(routing.defaultLocale, ns);
      const other = readNs(locale, ns);
      for (const key of keys(base)) {
        const expected = placeholders(String(leafValue(base, key)));
        const actual = placeholders(String(leafValue(other, key)));
        if (expected.join(",") !== actual.join(",")) {
          mismatches.push(`${ns}:${key} — PL [${expected}] vs ${locale} [${actual}]`);
        }
      }
    }
    // zgubiona wstawka nie wywala aplikacji, tylko po cichu gubi liczbę w zdaniu
    expect(mismatches, "rozjazd wstawek").toEqual([]);
  });
});
