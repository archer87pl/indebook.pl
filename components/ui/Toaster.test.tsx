// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Toaster from "./Toaster";

// Toasty panelu. Akcje serwerowe kończą się przekierowaniem z parametrem
// (?saved=1 / ?error=… / ?synced=N), a Toaster ma go pokazać i ZDJĄĆ z adresu.
// Dwie rzeczy są tu nieoczywiste i obie widać tylko w teście jednostkowym:
// strażnik podwójnego wywołania (StrictMode montuje efekt dwa razy — bez niego
// właściciel widzi każdy toast podwójnie) i zerowanie strażnika, żeby ten sam
// komunikat po drugiej próbie akcji znów się pokazał.

let searchParams = new URLSearchParams();
let pathname = "/admin/rezerwacje";
const replaced: { url: string; options?: unknown }[] = [];

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => pathname,
  useRouter: () => ({
    replace: (url: string, options?: unknown) => {
      replaced.push({ url, options });
    },
  }),
}));

const renderToaster = (query: string, path = "/admin/rezerwacje") => {
  searchParams = new URLSearchParams(query);
  pathname = path;
  return render(<Toaster />);
};

/** Toast powstaje w requestAnimationFrame — trzeba przepuścić ramkę. */
async function flushFrame() {
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
}

beforeEach(() => {
  replaced.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("pokazywanie powiadomień", () => {
  it("bez parametru wyniku nie renderuje niczego", async () => {
    renderToaster("");
    await flushFrame();

    expect(screen.queryByRole("status")).toBeNull();
    expect(replaced).toEqual([]);
  });

  it("?saved=1 daje potwierdzenie zapisu", async () => {
    renderToaster("saved=1");
    await flushFrame();

    expect(screen.getByRole("status").textContent).toContain("Zapisano zmiany.");
  });

  it("?error=… pokazuje treść błędu, rozkodowaną z adresu", async () => {
    // akcje serwerowe kodują komunikat w URL-u; właściciel ma zobaczyć zdanie,
    // nie ciąg procentów
    renderToaster(`error=${encodeURIComponent("Nie można usunąć — są rezerwacje.")}`);
    await flushFrame();

    expect(screen.getByRole("status").textContent).toContain(
      "Nie można usunąć — są rezerwacje."
    );
  });

  it("?synced=N wstawia liczbę zaimportowanych terminów", async () => {
    renderToaster("synced=7");
    await flushFrame();

    expect(screen.getByRole("status").textContent).toContain("7");
  });

  it("?invited=1 potwierdza wysłanie linku do meldunku", async () => {
    renderToaster("invited=1");
    await flushFrame();

    expect(screen.getByRole("status").textContent).toContain("meldunku");
  });

  it("dwa parametry naraz dają dwa powiadomienia", async () => {
    renderToaster("saved=1&synced=3");
    await flushFrame();

    expect(screen.getAllByRole("status")).toHaveLength(2);
  });

  it("nieznany parametr jest ignorowany", async () => {
    renderToaster("cokolwiek=1");
    await flushFrame();

    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("czyszczenie adresu", () => {
  it("obsłużony parametr znika z adresu, bez przewijania strony", async () => {
    // parametr w adresie oznaczałby, że odświeżenie pokazuje toast od nowa
    renderToaster("saved=1");
    await flushFrame();

    expect(replaced).toHaveLength(1);
    expect(replaced[0].url).toBe("/admin/rezerwacje");
    expect(replaced[0].options).toMatchObject({ scroll: false });
  });

  it("pozostałe parametry zostają w adresie", async () => {
    // ?q=willa to filtr listy — zdjęcie go razem z toastem zgubiłoby widok
    renderToaster("saved=1&q=willa&strona=2");
    await flushFrame();

    const url = new URL(replaced[0].url, "http://localhost");
    expect(url.searchParams.get("q")).toBe("willa");
    expect(url.searchParams.get("strona")).toBe("2");
    expect(url.searchParams.get("saved")).toBeNull();
  });

  it("czyszczenie zachowuje ścieżkę, na której stoimy", async () => {
    renderToaster("saved=1", "/admin/pokoje");
    await flushFrame();

    expect(replaced[0].url).toBe("/admin/pokoje");
  });
});

describe("zamykanie", () => {
  it("powiadomienie da się zamknąć ręcznie", async () => {
    renderToaster("saved=1");
    await flushFrame();

    await userEvent.click(screen.getByLabelText("Zamknij powiadomienie"));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("po pięciu sekundach znika samo", async () => {
    renderToaster("saved=1");
    await flushFrame();
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("przed upływem czasu jeszcze wisi", async () => {
    renderToaster("saved=1");
    await flushFrame();

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("z dwóch powiadomień zamknięcie jednego zostawia drugie", async () => {
    renderToaster("saved=1&synced=3");
    await flushFrame();

    await userEvent.click(screen.getAllByLabelText("Zamknij powiadomienie")[0]);

    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("strażnik podwójnego wywołania", () => {
  it("ten sam parametr nie mnoży powiadomień przy powtórnym efekcie", async () => {
    // StrictMode montuje efekt dwa razy — bez strażnika właściciel widziałby
    // każdy toast podwójnie
    const { rerender } = renderToaster("saved=1");
    await flushFrame();

    rerender(<Toaster />);
    await flushFrame();

    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("po zniknięciu parametru strażnik się zeruje, więc druga próba znów alarmuje", async () => {
    // właściciel poprawia dane i klika ponownie — ten sam komunikat błędu
    // musi się pokazać po raz drugi
    const { rerender } = renderToaster("error=Blad");
    await flushFrame();
    expect(screen.getByRole("status")).toBeTruthy();
    await userEvent.click(screen.getByLabelText("Zamknij powiadomienie"));

    searchParams = new URLSearchParams(""); // adres wyczyszczony
    rerender(<Toaster />);
    await flushFrame();

    searchParams = new URLSearchParams("error=Blad"); // ta sama akcja, ten sam błąd
    rerender(<Toaster />);
    await flushFrame();

    expect(screen.getByRole("status").textContent).toContain("Blad");
  });
});
