// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InquiryForm, { type InquiryLabels } from "./InquiryForm";

// Formularz zapytania na stronie WWW obiektu. E2E sprawdza samą trasę API;
// tutaj chodzi o to, co widzi gość: stan wysyłki, komunikat błędu z odpowiedzi
// (a nie ogólnikowy), wyczyszczenie pól po sukcesie i ukryte pole-pułapka,
// którego człowiek nie ma jak wypełnić.

const LABELS: InquiryLabels = {
  name: "Imię i nazwisko",
  email: "E-mail",
  phone: "Telefon",
  message: "Wiadomość",
  send: "Wyślij zapytanie",
  sentTitle: "Dziękujemy!",
  sentBody: "Odpowiemy najszybciej, jak to możliwe.",
  error: "Nie udało się wysłać zapytania.",
};

type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];
let respond: () => { ok: boolean; payload?: unknown } = () => ({ ok: true });
/** Blokuje odpowiedź, żeby dało się zobaczyć stan „wysyłanie". */
let hold: (() => void) | null = null;

function mountFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(init.body as string) });
      if (hold) await new Promise<void>((resolve) => (hold = resolve));
      const { ok, payload } = respond();
      return new Response(JSON.stringify(payload ?? { ok }), { status: ok ? 200 : 400 });
    })
  );
}

const renderForm = () => render(<InquiryForm siteKey="willa" labels={LABELS} />);

/** Wypełnia wymagane pola — walidacja HTML blokuje wysyłkę bez nich. */
async function fillRequired(over: { name?: string; email?: string; message?: string } = {}) {
  await userEvent.type(screen.getByLabelText(LABELS.name), over.name ?? "Anna Kowalska");
  await userEvent.type(screen.getByLabelText(LABELS.email), over.email ?? "anna@example.com");
  await userEvent.type(
    screen.getByLabelText(LABELS.message),
    over.message ?? "Czy jest wolny pokój w sierpniu?"
  );
}

const send = () => userEvent.click(screen.getByRole("button", { name: /Wyślij/ }));

beforeEach(() => {
  calls = [];
  respond = () => ({ ok: true });
  hold = null;
  mountFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("wysyłka", () => {
  it("wysyła wypełnione pola razem z kluczem strony", async () => {
    // siteKey nie jest polem formularza — dokłada go komponent, bo to on wie,
    // na której stronie stoi
    renderForm();
    await fillRequired();

    await send();

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("/api/sites/inquiry");
    expect(calls[0].body).toMatchObject({
      siteKey: "willa",
      name: "Anna Kowalska",
      email: "anna@example.com",
      message: "Czy jest wolny pokój w sierpniu?",
    });
  });

  it("po sukcesie pokazuje podziękowanie zamiast formularza", async () => {
    renderForm();
    await fillRequired();

    await send();

    expect(await screen.findByText(LABELS.sentTitle)).toBeTruthy();
    expect(screen.getByText(LABELS.sentBody)).toBeTruthy();
    expect(screen.queryByLabelText(LABELS.message)).toBeNull();
  });

  it("w trakcie wysyłki przycisk jest zablokowany", async () => {
    // podwójne kliknięcie wysłałoby zapytanie dwa razy i zużyło pulę limitu
    hold = () => {};
    renderForm();
    await fillRequired();

    await send();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Wyślij/ })).toHaveProperty("disabled", true)
    );
    expect(calls).toHaveLength(1);
  });

  it("telefon jest nieobowiązkowy", async () => {
    renderForm();
    await fillRequired();

    await send();

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body.phone).toBe("");
  });

  it("podany telefon trafia do zapytania", async () => {
    renderForm();
    await fillRequired();
    await userEvent.type(screen.getByLabelText(LABELS.phone), "+48600100200");

    await send();

    await waitFor(() => expect(calls[0].body.phone).toBe("+48600100200"));
  });
});

describe("błędy", () => {
  it("komunikat z odpowiedzi API pokazuje się gościowi", async () => {
    // ogólnikowe „nie udało się" nie mówi, że e-mail jest niepoprawny
    respond = () => ({ ok: false, payload: { error: "Uzupełnij poprawny e-mail." } });
    renderForm();
    await fillRequired();

    await send();

    expect(await screen.findByText("Uzupełnij poprawny e-mail.")).toBeTruthy();
  });

  it("odpowiedź bez treści degraduje do komunikatu ogólnego", async () => {
    respond = () => ({ ok: false, payload: "<html>502</html>" });
    renderForm();
    await fillRequired();

    await send();

    expect(await screen.findByText(LABELS.error)).toBeTruthy();
  });

  it("po błędzie formularz zostaje wypełniony, żeby dało się poprawić", async () => {
    // wyczyszczenie pól kazałoby wpisywać wszystko od nowa
    respond = () => ({ ok: false, payload: { error: "Za krótka wiadomość." } });
    renderForm();
    await fillRequired();

    await send();

    expect(await screen.findByText("Za krótka wiadomość.")).toBeTruthy();
    expect(screen.getByLabelText(LABELS.name)).toHaveProperty("value", "Anna Kowalska");
  });

  it("ponowna próba po błędzie czyści poprzedni komunikat", async () => {
    respond = () => ({ ok: false, payload: { error: "Chwilowy błąd." } });
    renderForm();
    await fillRequired();
    await send();
    expect(await screen.findByText("Chwilowy błąd.")).toBeTruthy();

    respond = () => ({ ok: true });
    await send();

    expect(await screen.findByText(LABELS.sentTitle)).toBeTruthy();
  });

  it("padnięta sieć pokazuje komunikat, a nie białą stronę", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      })
    );
    renderForm();
    await fillRequired();

    await send();

    expect(await screen.findByText("Failed to fetch")).toBeTruthy();
  });

  it("po błędzie przycisk znów działa", async () => {
    respond = () => ({ ok: false, payload: { error: "Błąd." } });
    renderForm();
    await fillRequired();
    await send();
    await screen.findByText("Błąd.");

    expect(screen.getByRole("button", { name: /Wyślij/ })).toHaveProperty("disabled", false);
  });
});

describe("pułapka na boty", () => {
  it("ukryte pole „website” jest w formularzu, ale niedostępne dla człowieka", async () => {
    // wyprowadzone za ekran, wyjęte z kolejności tabulacji i ukryte przed
    // czytnikami — człowiek nie ma jak go wypełnić, bot wypełni wszystko
    renderForm();

    const honeypot = document.querySelector('input[name="website"]') as HTMLInputElement;

    expect(honeypot).toBeTruthy();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.getAttribute("aria-hidden")).toBe("true");
    expect(honeypot.getAttribute("autocomplete")).toBe("off");
    expect(honeypot.className).toContain("-left-[9999px]");
  });

  it("puste pole-pułapka jedzie w zapytaniu — trasa odróżnia je od wypełnionego", async () => {
    renderForm();
    await fillRequired();

    await send();

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body).toHaveProperty("website", "");
  });
});

describe("walidacja przeglądarki", () => {
  it("pola wymagane i limity są zadeklarowane w znacznikach", async () => {
    // pierwsza linia obrony jest w przeglądarce; trasa API sprawdza to samo
    renderForm();

    const name = screen.getByLabelText(LABELS.name);
    const email = screen.getByLabelText(LABELS.email);
    const message = screen.getByLabelText(LABELS.message);

    expect(name).toHaveProperty("required", true);
    expect(name).toHaveProperty("maxLength", 120);
    expect(email).toHaveProperty("type", "email");
    expect(email).toHaveProperty("maxLength", 200);
    expect(message).toHaveProperty("required", true);
    expect(message).toHaveProperty("minLength", 10);
    expect(message).toHaveProperty("maxLength", 2000);
  });
});
