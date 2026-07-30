// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Site } from "@prisma/client";
import DomainPanel from "./DomainPanel";

// Panel własnej domeny — komponent SERWEROWY, który przy każdym renderze
// pyta dostawcę o realny stan DNS. Cztery stany dają cztery różne widoki
// i pomyłka w którymkolwiek zostawia właściciela bez instrukcji, co zrobić:
// brak integracji (panel ukryty), plan bez domen, domena niepodpięta,
// domena podpięta (z rekordami DNS do wpisania albo potwierdzeniem).
// Zapytanie do dostawcy może paść — wtedy pokazujemy ostatni znany status.

let provider: { check: (domain: string) => Promise<unknown> } | null = null;
let checkResult: unknown = null;
let checkThrows = false;
const checked: string[] = [];

vi.mock("@/lib/domains", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domains")>()),
  domainProvider: () => provider,
}));

vi.mock("@/lib/site-actions", () => ({
  refreshDomainStatus: vi.fn(),
  removeCustomDomain: vi.fn(),
  setCustomDomain: vi.fn(),
}));

const site = (over: Partial<Site> = {}) =>
  ({
    id: 21,
    subdomain: "willa",
    customDomain: null,
    domainStatus: "NONE",
    ...over,
  }) as Site;

const RECORDS = [
  { type: "A", name: "@", value: "76.76.21.21" },
  { type: "CNAME", name: "www", value: "cname.vercel-dns.com" },
];

/** Komponent jest asynchroniczny — renderujemy rozwiązany element. */
const renderPanel = async (props: { site: Site; plan: string }) =>
  render(await DomainPanel(props));

beforeEach(() => {
  checked.length = 0;
  checkThrows = false;
  checkResult = { status: "PENDING", message: "Dodaj rekordy DNS.", records: RECORDS };
  provider = {
    check: async (domain: string) => {
      checked.push(domain);
      if (checkThrows) throw new Error("Vercel: 503");
      return checkResult;
    },
  };
});

afterEach(cleanup);

describe("dostępność panelu", () => {
  it("bez skonfigurowanego dostawcy panel w ogóle się nie pokazuje", async () => {
    // na instalacji bez integracji obietnica własnych domen byłaby fałszywa
    provider = null;

    const { container } = await renderPanel({ site: site(), plan: "PRO" });

    expect(container.innerHTML).toBe("");
  });

  it("plan bez własnych domen dostaje informację, w którym planie to jest", async () => {
    await renderPanel({ site: site(), plan: "STANDARD" });

    expect(screen.getByText(/Własna domena/)).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.queryByLabelText("Domena")).toBeNull();
  });

  it("plan bez domen nie odpytuje dostawcy", async () => {
    await renderPanel({ site: site({ customDomain: "willa.pl" }), plan: "FREE" });

    expect(checked).toEqual([]);
  });
});

describe("domena niepodpięta", () => {
  it("pokazuje formularz podpięcia z podpowiedzią formatu", async () => {
    await renderPanel({ site: site(), plan: "PRO" });

    const input = screen.getByLabelText("Domena");
    expect(input.getAttribute("placeholder")).toContain("mojobiekt.pl");
    expect(screen.getByRole("button", { name: /Podepnij/ })).toBeTruthy();
  });

  it("nie odpytuje dostawcy, bo nie ma o co pytać", async () => {
    await renderPanel({ site: site(), plan: "PRO" });

    expect(checked).toEqual([]);
  });

  it("nie pokazuje przycisków odświeżania ani odpinania", async () => {
    await renderPanel({ site: site(), plan: "PRO" });

    expect(screen.queryByRole("button", { name: /Odśwież status/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Odepnij/ })).toBeNull();
  });
});

describe("domena podpięta, oczekująca na DNS", () => {
  const pending = { site: site({ customDomain: "willa.pl", domainStatus: "PENDING" }), plan: "PRO" };

  it("pyta dostawcę o realny stan tej domeny", async () => {
    await renderPanel(pending);

    expect(checked).toEqual(["willa.pl"]);
  });

  it("pokazuje domenę, status i komunikat od dostawcy", async () => {
    await renderPanel(pending);

    expect(screen.getByText("willa.pl")).toBeTruthy();
    expect(screen.getByText(/Oczekuje na DNS/)).toBeTruthy();
    expect(screen.getByText("Dodaj rekordy DNS.")).toBeTruthy();
  });

  it("wypisuje rekordy DNS do wpisania u rejestratora", async () => {
    // bez tej tabeli właściciel nie ma jak dokończyć podpięcia
    await renderPanel(pending);

    expect(screen.getByText("76.76.21.21")).toBeTruthy();
    expect(screen.getByText("cname.vercel-dns.com")).toBeTruthy();
    expect(screen.getByText("CNAME")).toBeTruthy();
  });

  it("dołącza instrukcję krok po kroku", async () => {
    await renderPanel(pending);

    expect(screen.getByText(/panelu rejestratora domeny/)).toBeTruthy();
    expect(screen.getByText(/propagacja trwa zwykle do godziny/i)).toBeTruthy();
  });

  it("daje odświeżenie statusu i odpięcie", async () => {
    await renderPanel(pending);

    expect(screen.getByRole("button", { name: /Odśwież status/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Odepnij domenę/ })).toBeTruthy();
  });
});

describe("domena zweryfikowana", () => {
  beforeEach(() => {
    checkResult = {
      status: "VERIFIED",
      message: "Domena działa. Certyfikat SSL wystawia się automatycznie.",
      records: RECORDS,
    };
  });

  it("pokazuje potwierdzenie bez tabeli rekordów", async () => {
    // rekordy są już wpisane — tabela tylko rozpraszałaby
    await renderPanel({
      site: site({ customDomain: "willa.pl", domainStatus: "VERIFIED" }),
      plan: "PRO",
    });

    expect(screen.getByText(/Zweryfikowana/)).toBeTruthy();
    expect(screen.getByText(/Certyfikat SSL/)).toBeTruthy();
    expect(screen.queryByText("76.76.21.21")).toBeNull();
  });
});

describe("awaria dostawcy", () => {
  it("pokazuje ostatni znany status z bazy, zamiast pustki", async () => {
    // zapytanie do API mogło paść, ale właściciel ma widzieć stan swojej domeny
    checkThrows = true;

    await renderPanel({
      site: site({ customDomain: "willa.pl", domainStatus: "VERIFIED" }),
      plan: "PRO",
    });

    expect(screen.getByText("willa.pl")).toBeTruthy();
    expect(screen.getByText(/Zweryfikowana/)).toBeTruthy();
  });

  it("bez odpowiedzi nie pokazuje rekordów DNS ani instrukcji", async () => {
    // wypisanie rekordów „z niczego" wprowadzałoby w błąd
    checkThrows = true;

    await renderPanel({
      site: site({ customDomain: "willa.pl", domainStatus: "PENDING" }),
      plan: "PRO",
    });

    expect(screen.queryByText("76.76.21.21")).toBeNull();
    expect(screen.queryByText(/panelu rejestratora/)).toBeNull();
  });

  it("mimo awarii zostawia przyciski, żeby dało się spróbować ponownie", async () => {
    checkThrows = true;

    await renderPanel({
      site: site({ customDomain: "willa.pl", domainStatus: "PENDING" }),
      plan: "PRO",
    });

    expect(screen.getByRole("button", { name: /Odśwież status/ })).toBeTruthy();
  });

  it("status ERROR od dostawcy jest pokazany jako błąd", async () => {
    checkResult = {
      status: "ERROR",
      message: "Domena jest już użyta w innym projekcie.",
      records: [],
    };

    await renderPanel({
      site: site({ customDomain: "willa.pl", domainStatus: "PENDING" }),
      plan: "PRO",
    });

    expect(screen.getByText(/Błąd/)).toBeTruthy();
    expect(screen.getByText(/już użyta w innym projekcie/)).toBeTruthy();
  });
});
