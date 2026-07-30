// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { routing } from "@/i18n/routing";
import LangSwitcher from "./LangSwitcher";
import SiteLangSwitcher from "./site/SiteLangSwitcher";

// Dwa przełączniki języka o RÓŻNYCH mechanizmach — łatwo je pomylić przy
// refaktorze, a skutek jest cichy: gość zostaje w starym języku.
//  • LangSwitcher (aplikacja): zmiana trasy przez next-intl, bo interfejs
//    gościa ma prefiks języka w adresie (/en/o/willa).
//  • SiteLangSwitcher (strony WWW obiektów): te strony są POZA routingiem
//    next-intl, więc język idzie do cookie i strona się przeładowuje.

const replaced: { pathname: string; options?: { locale?: string } }[] = [];
let currentLocale = "pl";

vi.mock("next-intl", () => ({ useLocale: () => currentLocale }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/o/willa-pod-debem",
  useRouter: () => ({
    replace: (pathname: string, options?: { locale?: string }) => {
      replaced.push({ pathname, options });
    },
  }),
}));

const lang = (code: string) => screen.getByRole("button", { name: code.toUpperCase() });
const activeCode = () =>
  screen
    .getAllByRole("button")
    .find((b) => b.getAttribute("aria-current") === "true")
    ?.textContent;

beforeEach(() => {
  replaced.length = 0;
  currentLocale = "pl";
});

afterEach(cleanup);

describe("LangSwitcher (aplikacja)", () => {
  it("pokazuje wszystkie języki serwisu", () => {
    render(<LangSwitcher />);

    for (const l of routing.locales) {
      expect(lang(l), l).toBeTruthy();
    }
  });

  it("bieżący język jest oznaczony dla czytników, nie tylko kolorem", () => {
    currentLocale = "de";
    render(<LangSwitcher />);

    expect(activeCode()).toBe("DE");
  });

  it("kliknięcie zmienia TĘ SAMĄ ścieżkę na inny język", () => {
    // przeniesienie gościa na stronę główną przy zmianie języka byłoby
    // gubieniem kontekstu — ma zostać na tym samym obiekcie
    render(<LangSwitcher />);

    userEvent.click(lang("en"));

    return vi.waitFor(() => {
      expect(replaced).toEqual([
        { pathname: "/o/willa-pod-debem", options: { locale: "en" } },
      ]);
    });
  });

  it("grupa przycisków jest podpisana dwujęzycznie", () => {
    // ktoś, kto nie zna polskiego, musi rozpoznać przełącznik
    render(<LangSwitcher />);

    const group = screen.getByRole("group");
    expect(group.getAttribute("aria-label")).toContain("Language");
  });

  it("kliknięcie bieżącego języka też przechodzi przez router — bez stanu do zepsucia", async () => {
    render(<LangSwitcher />);

    await userEvent.click(lang("pl"));

    expect(replaced).toHaveLength(1);
    expect(replaced[0].options).toEqual({ locale: "pl" });
  });
});

describe("SiteLangSwitcher (strony WWW obiektów)", () => {
  const fetchCalls: { url: string; body: unknown }[] = [];
  const reload = vi.fn();

  beforeEach(() => {
    fetchCalls.length = 0;
    reload.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        fetchCalls.push({ url: String(url), body: JSON.parse(init.body as string) });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("zapisuje wybrany język w cookie przez API, a nie w adresie", async () => {
    // te strony nie mają prefiksu języka — zmiana adresu nic by nie dała
    render(<SiteLangSwitcher current="pl" />);

    await userEvent.click(lang("en"));

    expect(fetchCalls).toEqual([
      { url: "/api/sites/locale", body: { locale: "en" } },
    ]);
  });

  it("po zapisie przeładowuje stronę, żeby serwer oddał ją w nowym języku", async () => {
    render(<SiteLangSwitcher current="pl" />);

    await userEvent.click(lang("de"));

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });

  it("kliknięcie bieżącego języka nic nie robi", async () => {
    // niepotrzebne żądanie i przeładowanie strony w miejscu
    render(<SiteLangSwitcher current="pl" />);

    await userEvent.click(lang("pl"));

    expect(fetchCalls).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("w trakcie zapisu przyciski są zablokowane", async () => {
    // dwa kliknięcia z rzędu to dwa żądania i wyścig, który język wygra
    // przypisanie w domknięciu nie jest widziane przez zawężanie typów,
    // więc uchwyt trzymamy w obiekcie
    const held: { release: (() => void) | null } = { release: null };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
        return new Response("{}", { status: 200 });
      })
    );
    render(<SiteLangSwitcher current="pl" />);

    await userEvent.click(lang("en"));

    await vi.waitFor(() => expect(lang("de")).toHaveProperty("disabled", true));
    held.release?.();
  });

  it("błąd zapisu odblokowuje przyciski, żeby dało się spróbować ponownie", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      })
    );
    render(<SiteLangSwitcher current="pl" />);

    await userEvent.click(lang("en"));

    await vi.waitFor(() => expect(lang("en")).toHaveProperty("disabled", false));
    expect(reload).not.toHaveBeenCalled();
  });

  it("bieżący język jest oznaczony dla czytników", () => {
    render(<SiteLangSwitcher current="en" />);

    expect(activeCode()).toBe("EN");
  });
});
