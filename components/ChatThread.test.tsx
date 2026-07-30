// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ChatThread, { type ChatThreadLabels } from "./ChatThread";
import SyncModeSwitch from "./admin/SyncModeSwitch";

// Dwa komponenty o wspólnej cechie: ich wynik zależy od tego, KTO patrzy albo
// CO jest aktywne, a pomyłka jest cicha.
//  • ChatThread renderuje ten sam wątek dwóch stron — „Ty" musi wskazywać
//    właściwą osobę, inaczej gość czyta swoje wiadomości jako odpowiedzi
//    recepcji.
//  • SyncModeSwitch blokuje bieżący tryb (żeby nie przełączać na to samo)
//    i tryb Channex bez planu Pro.

const msg = (id: number, sender: "GUEST" | "OWNER", body: string) => ({
  id,
  sender,
  body,
  createdAt: new Date("2026-08-10T14:30:00Z"),
});

const THREAD = [
  msg(1, "GUEST", "O której można się zameldować?"),
  msg(2, "OWNER", "Od 15:00."),
];

afterEach(cleanup);

describe("ChatThread — perspektywa czytającego", () => {
  it("gość widzi swoje wiadomości jako „Ty”, a odpowiedzi jako obiekt", () => {
    render(<ChatThread messages={THREAD} viewer="GUEST" />);

    const labels = screen.getAllByText(/Ty|Obiekt/).map((el) => el.textContent);
    expect(labels[0]).toContain("Ty");
    expect(labels[1]).toContain("Obiekt");
  });

  it("recepcja widzi TE SAME wiadomości z odwróconymi podpisami", () => {
    // to jest sedno: jeden wątek, dwie perspektywy
    render(<ChatThread messages={THREAD} viewer="OWNER" />);

    const labels = screen.getAllByText(/Ty|Gość/).map((el) => el.textContent);
    expect(labels[0]).toContain("Gość");
    expect(labels[1]).toContain("Ty");
  });

  it("własne wiadomości są wyrównane do prawej, obce do lewej", () => {
    render(<ChatThread messages={THREAD} viewer="GUEST" />);

    const own = screen.getByText("O której można się zameldować?").closest("div")!.parentElement!;
    const other = screen.getByText("Od 15:00.").closest("div")!.parentElement!;
    expect(own.className).toContain("ml-auto");
    expect(other.className).not.toContain("ml-auto");
  });

  it("pusty wątek zachęca do napisania pierwszej wiadomości", () => {
    render(<ChatThread messages={[]} viewer="GUEST" />);

    expect(screen.getByText(/Brak wiadomości/)).toBeTruthy();
  });

  it("panel gościa może podstawić własne tłumaczenia", () => {
    // recepcja zostaje po polsku, gość widzi swój język
    const labels: ChatThreadLabels = {
      empty: "No messages yet.",
      you: "You",
      owner: "Property",
      guest: "Guest",
    };

    render(<ChatThread messages={THREAD} viewer="GUEST" labels={labels} />);

    expect(screen.getByText(/You/)).toBeTruthy();
    expect(screen.getByText(/Property/)).toBeTruthy();
  });

  it("pusty wątek też używa podstawionych tłumaczeń", () => {
    render(
      <ChatThread
        messages={[]}
        viewer="GUEST"
        labels={{ empty: "No messages yet.", you: "You", owner: "Property", guest: "Guest" }}
      />
    );

    expect(screen.getByText("No messages yet.")).toBeTruthy();
  });

  it("łamanie linii z wiadomości jest zachowane", () => {
    // gość wysyła adres albo listę pytań w kilku linijkach
    render(<ChatThread messages={[msg(1, "GUEST", "Linia 1\nLinia 2")]} viewer="GUEST" />);

    const body = screen.getByText(/Linia 1/);
    expect(body.className).toContain("whitespace-pre-line");
  });

  it("długie słowo bez spacji nie rozpycha układu", () => {
    render(<ChatThread messages={[msg(1, "GUEST", "a".repeat(120))]} viewer="GUEST" />);

    expect(screen.getByText("a".repeat(120)).className).toContain("break-words");
  });

  it("każda wiadomość ma datę i godzinę", () => {
    render(<ChatThread messages={THREAD} viewer="GUEST" />);

    // format skrócony pl-PL: „10.08.2026, 16:30" (strefa lokalna)
    expect(screen.getAllByText(/\d{2}\.\d{2}\.\d{4}/).length).toBe(2);
  });
});

describe("SyncModeSwitch", () => {
  const opt = (name: RegExp) => screen.getByRole("button", { name });

  it("bieżący tryb jest zablokowany — nie ma po co przełączać na to samo", () => {
    render(<SyncModeSwitch mode="ICAL" channexEnabled />);

    expect(opt(/^iCal$/)).toHaveProperty("disabled", true);
    expect(opt(/Bez synchronizacji/)).toHaveProperty("disabled", false);
  });

  it("Channex bez planu Pro jest zablokowany i wyjaśnia dlaczego", () => {
    // sam zablokowany przycisk bez podpowiedzi zostawiłby właściciela
    // z pytaniem, czego mu brakuje
    render(<SyncModeSwitch mode="OFF" channexEnabled={false} />);

    const channex = opt(/Channex/);
    expect(channex).toHaveProperty("disabled", true);
    expect(channex.getAttribute("title")).toContain("Pro");
  });

  it("Channex włączony na platformie jest wybieralny", () => {
    render(<SyncModeSwitch mode="OFF" channexEnabled />);

    const channex = opt(/Channex/);
    expect(channex).toHaveProperty("disabled", false);
    expect(channex.getAttribute("title")).toBeNull();
  });

  it("każdy tryb ma własny formularz z jego wartością", () => {
    // wspólny formularz wymagałby stanu po stronie klienta; tu każdy przycisk
    // wysyła swoją wartość wprost do akcji serwerowej
    render(<SyncModeSwitch mode="OFF" channexEnabled />);

    const modes = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="mode"]')
    ).map((i) => i.value);
    expect(modes).toEqual(["OFF", "ICAL", "CHANNEX"]);
  });

  it("aktywny tryb jest wyróżniony wizualnie", () => {
    render(<SyncModeSwitch mode="CHANNEX" channexEnabled />);

    expect(opt(/Channex/).className).toContain("bg-brand-900");
  });
});
