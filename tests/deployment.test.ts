// Testy artefaktów wdrożeniowych: pliki Compose i Dockerfile. Nie uruchamiają
// Dockera — czytają definicje i sprawdzają niezmienniki, na których wywrócił
// się self-host: baza wskazana na SQLite mimo `provider = "postgresql"`,
// brakujące zmienne środowiskowe, kolizje nazw usług i portów po scaleniu obu
// repo, oraz kolejność kroków w Dockerfile.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SMARTRATE_DIR = join(ROOT, "services", "smartrate");

type Service = {
  image?: string;
  build?: unknown;
  ports?: string[];
  environment?: Record<string, string>;
  depends_on?: Record<string, { condition?: string }>;
};
type Compose = {
  include?: { path: string }[];
  services?: Record<string, Service>;
};

function compose(path: string): Compose {
  // Compose dokłada do YAML-a własne tagi scalania (!override, !reset), których
  // parser nie zna. Dla naszych asercji liczy się sama wartość, więc zdejmujemy
  // je przed parsowaniem — zamiast rejestrować tagi pod konkretną wersję js-yaml.
  const text = readFileSync(path, "utf8").replace(/(:\s*)!(override|reset)\s+/g, "$1");
  return load(text) as Compose;
}

/**
 * Port hosta z zapisu "3000:3000", "${APP_PORT:-3000}:3000" albo
 * "127.0.0.1:3000:3000". Najpierw rozwijamy domyślne wartości zmiennych —
 * inaczej dzielenie po ":" tnie zapis `${VAR:-default}` w środku i port
 * aplikacji przepada (przez co test kolizji przechodził na pusto).
 */
function hostPort(mapping: string): string {
  const resolved = mapping.replace(/\$\{[A-Z0-9_]+:-([^}]*)\}/g, "$1");
  const parts = resolved.split(":");
  return parts.length >= 2 ? parts[parts.length - 2] : parts[0];
}

function hostPorts(service: Service | undefined): string[] {
  return (service?.ports ?? []).map(hostPort);
}

/**
 * Porty usługi po scaleniu z nadpisaniem. Compose SCALA definicje usług:
 * nadpisanie bez klucza `ports` zostawia porty z pliku bazowego, a `!override`
 * podmienia całą listę. Traktowanie nadpisania jak pełnego zastąpienia gubiło
 * port aplikacji i test kolizji przechodził na pusto.
 */
function effectivePorts(base: Service | undefined, override: Service | undefined): string[] {
  return hostPorts(override?.ports ? override : base);
}

const app = compose(join(ROOT, "docker-compose.yml"));
const full = compose(join(ROOT, "docker-compose.full.yml"));
const appServices = app.services ?? {};

describe("docker-compose.yml — aplikacja i baza", () => {
  it("definiuje aplikację budowaną z repo oraz własnego Postgresa", () => {
    expect(appServices.rezflow?.build).toBeDefined();
    expect(appServices["rezflow-db"]?.image).toMatch(/^postgres:/);
  });

  it("baza NIE nazywa się „postgres”, bo tę nazwę ma usługa SmartRate", () => {
    // docker-compose.full.yml scala oba pliki w jeden projekt Compose, więc
    // zderzenie nazw sklejałoby dwie bazy w jedną usługę
    expect(appServices.postgres).toBeUndefined();
  });

  it("kieruje Prismę na Postgresa, nie na SQLite", () => {
    const env = appServices.rezflow?.environment ?? {};
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
      expect(env[key], `${key} musi być ustawione`).toBeDefined();
      expect(env[key]).toMatch(/^postgresql:\/\//);
      expect(env[key]).toContain("@rezflow-db:5432/");
    }
  });

  it("czeka na gotowość bazy przed startem aplikacji", () => {
    expect(appServices.rezflow?.depends_on?.["rezflow-db"]?.condition).toBe(
      "service_healthy"
    );
  });

  it("domyślnie używa stuba cen — w tym pliku nie ma usługi SmartRate", () => {
    expect(appServices.rezflow?.environment?.SMARTRATE_STUB).toContain("SMARTRATE_STUB:-1");
  });
});

describe("docker-compose.yml — kompletność zmiennych środowiskowych", () => {
  // Zmienne ustawiane przez platformę albo runner, nie przez operatora.
  const NOT_FROM_OPERATOR = new Set([
    "NEXT_RUNTIME",
    "NODE_ENV",
    "VERCEL",
    "VERCEL_URL",
    "VERCEL_PROJECT_ID",
    "VERCEL_TEAM_ID",
    "VERCEL_PROJECT_PRODUCTION_URL",
    "VERCEL_TOKEN",
    "TEST_DATABASE_URL",
  ]);

  function sourceFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) sourceFiles(full, acc);
      else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
    }
    return acc;
  }

  it("przekazuje każdą zmienną, którą kod czyta z process.env", () => {
    const used = new Set<string>();
    for (const dir of ["lib", "app", "components", "i18n"]) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        for (const m of readFileSync(file, "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
          used.add(m[1]);
        }
      }
    }
    for (const file of ["proxy.ts", "instrumentation.ts"]) {
      for (const m of readFileSync(join(ROOT, file), "utf8").matchAll(
        /process\.env\.([A-Z0-9_]+)/g
      )) {
        used.add(m[1]);
      }
    }

    const provided = new Set(Object.keys(appServices.rezflow?.environment ?? {}));
    const missing = [...used].filter((k) => !NOT_FROM_OPERATOR.has(k) && !provided.has(k));
    expect(missing, `brak w docker-compose.yml: ${missing.join(", ")}`).toEqual([]);
  });
});

describe("docker-compose.full.yml — spięcie obu systemów", () => {
  it("wciąga oba pliki Compose do jednego projektu", () => {
    const paths = (full.include ?? []).map((i) => i.path);
    expect(paths).toContain("docker-compose.yml");
    expect(paths).toContain("services/smartrate/docker-compose.yml");
  });

  it("kieruje aplikację na SmartRate po nazwie usługi i wyłącza stub", () => {
    const env = full.services?.rezflow?.environment ?? {};
    expect(env.SMARTRATE_URL).toBe("http://rezio-api:8080");
    expect(env.SMARTRATE_STUB).toBe("");
  });

  it("czeka na silnik cen przed startem aplikacji", () => {
    expect(full.services?.rezflow?.depends_on?.["rezio-api"]).toBeDefined();
  });
});

// SmartRate jest w tym samym repo, więc te asercje wykonują się ZAWSZE.
// Wcześniej pomijały się, gdy sąsiedniego repo nie było — czyli dokładnie
// tam, gdzie najbardziej by się przydały: na CI.
const smartRate = compose(join(SMARTRATE_DIR, "docker-compose.yml"));

describe("scalenie z compose SmartRate", () => {
  it("nazwy usług nie kolidują", () => {
    const mine = Object.keys(appServices);
    const theirs = Object.keys(smartRate.services ?? {});
    expect(mine.filter((n) => theirs.includes(n))).toEqual([]);
  });

  it("porty hosta nie kolidują po nadpisaniach z docker-compose.full.yml", () => {
    const overrides = full.services ?? {};
    const merged: Record<string, string[]> = {};

    for (const [name, svc] of Object.entries(appServices)) {
      merged[name] = effectivePorts(svc, overrides[name]);
    }
    for (const [name, svc] of Object.entries(smartRate.services ?? {})) {
      merged[name] = effectivePorts(svc, overrides[name]);
    }

    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const [name, ports] of Object.entries(merged)) {
      for (const port of ports) {
        const owner = seen.get(port);
        if (owner) clashes.push(`${port}: ${owner} vs ${name}`);
        else seen.set(port, name);
      }
    }
    expect(clashes, `kolizje portów — ${clashes.join("; ")}`).toEqual([]);
  });

  it("zostawia wolny port 3100 dla serwera testów e2e", () => {
    const overrides = full.services ?? {};
    const all = [
      ...Object.entries(appServices),
      ...Object.entries(smartRate.services ?? {}),
    ];
    const users = all
      .filter(([name, svc]) => effectivePorts(svc, overrides[name]).includes("3100"))
      .map(([name]) => name);
    expect(users, `port 3100 należy do Playwrighta, zajmuje go: ${users}`).toEqual([]);
  });
});

describe("Dockerfile", () => {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
  const lineOf = (needle: RegExp) =>
    dockerfile.split("\n").findIndex((l) => needle.test(l));

  it("kopiuje schemat Prismy przed instalacją (postinstall woła prisma generate)", () => {
    const copySchema = lineOf(/^COPY prisma /);
    const install = lineOf(/npm ci/);
    expect(copySchema).toBeGreaterThanOrEqual(0);
    expect(copySchema).toBeLessThan(install);
  });

  it("pinuje npm do wersji z package.json — obraz ma starszy, który inaczej rozwiązuje lockfile", () => {
    const declared = (
      JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
        packageManager?: string;
      }
    ).packageManager;
    expect(declared).toMatch(/^npm@\d+\.\d+\.\d+$/);
    const version = declared!.split("@")[1];
    expect(dockerfile).toContain(`npm i -g npm@${version}`);
  });

  it("startuje z migracją schematu", () => {
    expect(dockerfile).toMatch(/CMD .*prisma db push/);
  });
});
