// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SyncLog from "./SyncLog";
import ChannelTiles from "./channels/ChannelTiles";

// Dwa panele zakładki „Kanały" — jedyne miejsce, w którym właściciel widzi,
// czy synchronizacja z OTA w ogóle żyje.
//  • SyncLog: ostatnie zdarzenia. Zapytanie musi być zawężone do TEGO obiektu
//    i do zdarzeń synchronizacji — log z cudzymi albo z płatnościami jest
//    gorszy niż brak logu.
//  • ChannelTiles: stan podłączenia per kanał. Kafel ma pokazywać formularz
//    podłączenia dokładnie wtedy, gdy kanał NIE jest podłączony.

const db = vi.hoisted(() => {
  const calls: { model: string; args: unknown }[] = [];
  const rows: { logs: Record<string, unknown>[]; channels: Record<string, unknown>[] } = {
    logs: [],
    channels: [],
  };
  return { calls, rows };
});

vi.mock("@/lib/db", () => ({
  prisma: {
    eventLog: {
      findMany: (args: unknown) => {
        db.calls.push({ model: "eventLog", args });
        return Promise.resolve(db.rows.logs);
      },
    },
    channexChannel: {
      findMany: (args: unknown) => {
        db.calls.push({ model: "channexChannel", args });
        return Promise.resolve(db.rows.channels);
      },
    },
  },
}));

vi.mock("@/lib/channex/channel-actions", () => ({
  connectBookingChannel: vi.fn(),
  refreshChannelStatus: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

const log = (over: Record<string, unknown> = {}) => ({
  id: 1,
  level: "INFO",
  message: "Zaimportowano 3 blokady z Booking.com",
  meta: "",
  createdAt: new Date("2026-07-30T08:30:00Z"),
  ...over,
});

const channel = (over: Record<string, unknown> = {}) => ({
  id: 1,
  type: "BOOKING",
  status: "NONE",
  lastError: "",
  ...over,
});

const argsFor = (model: string) => db.calls.filter((c) => c.model === model).map((c) => c.args);

beforeEach(() => {
  db.calls.length = 0;
  db.rows.logs = [];
  db.rows.channels = [];
});

afterEach(cleanup);

describe("SyncLog", () => {
  const renderLog = async (propertyId = 3) => render(await SyncLog({ propertyId }));

  it("pyta tylko o zdarzenia synchronizacji tego obiektu", async () => {
    // bez filtra po rodzaju log zalałyby płatności i maile
    await renderLog(7);

    expect(argsFor("eventLog")).toEqual([
      {
        where: { propertyId: 7, kind: { in: ["ICAL", "CHANNEX"] } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    ]);
  });

  it("pusty log mówi, kiedy się zapełni", async () => {
    await renderLog();

    expect(screen.getByText(/po pierwszym imporcie/)).toBeTruthy();
  });

  it("wypisuje treść zdarzenia i jego czas", async () => {
    db.rows.logs = [log()];

    await renderLog();

    expect(screen.getByText("Zaimportowano 3 blokady z Booking.com")).toBeTruthy();
    expect(screen.getByText(/30\.07\.2026/)).toBeTruthy();
  });

  it("poziom zdarzenia ma swój kolor — błąd musi rzucać się w oczy", async () => {
    const dot = (level: string) => {
      cleanup();
      db.rows.logs = [log({ level })];
      return SyncLog({ propertyId: 3 }).then((el) => {
        const { container } = render(el);
        return container.querySelector("span")!.className;
      });
    };

    expect(await dot("ERROR")).toContain("bg-red-500");
    expect(await dot("WARN")).toContain("bg-amber-500");
    expect(await dot("INFO")).toContain("bg-brand-500");
  });

  it("szczegóły techniczne pokazują się tylko wtedy, gdy są", async () => {
    db.rows.logs = [log({ meta: "feed: https://ical.booking.com/abc" })];
    await renderLog();
    expect(screen.getByText(/ical.booking.com/)).toBeTruthy();

    cleanup();
    db.rows.logs = [log({ meta: "" })];
    const { container } = render(await SyncLog({ propertyId: 3 }));
    expect(container.querySelectorAll("span.block")).toHaveLength(0);
  });

  it("wypisuje wszystkie pobrane zdarzenia", async () => {
    db.rows.logs = [log({ id: 1, message: "Pierwsze" }), log({ id: 2, message: "Drugie" })];

    await renderLog();

    expect(screen.getByText("Pierwsze")).toBeTruthy();
    expect(screen.getByText("Drugie")).toBeTruthy();
  });
});

describe("ChannelTiles", () => {
  const renderTiles = async (propertyId = 3) => render(await ChannelTiles({ propertyId }));
  const tile = (name: string) => screen.getByRole("heading", { name }).closest("div")!.parentElement!;

  it("pyta o kanały tego obiektu", async () => {
    await renderTiles(7);

    expect(argsFor("channexChannel")).toEqual([{ where: { propertyId: 7 } }]);
  });

  it("bez podłączonych kanałów oba kafle są „niepodłączone”", async () => {
    await renderTiles();

    expect(screen.getAllByText("Niepodłączony")).toHaveLength(2);
  });

  it("niepodłączony Booking prosi o Hotel ID", async () => {
    await renderTiles();

    const input = screen.getByLabelText(/Hotel ID/);
    expect(input.getAttribute("name")).toBe("hotelId");
    expect(input.hasAttribute("required")).toBe(true);
  });

  it("podłączony Booking nie pokazuje już formularza", async () => {
    // powtórne wpisanie Hotel ID nadpisałoby działające połączenie
    db.rows.channels = [channel({ status: "CONNECTED" })];

    await renderTiles();

    expect(screen.queryByLabelText(/Hotel ID/)).toBeNull();
    expect(screen.getByText(/Dostępność synchronizuje się automatycznie/)).toBeTruthy();
    expect(screen.getByText("Podłączony")).toBeTruthy();
  });

  it("stan pośredni jest nazwany, a formularz zostaje", async () => {
    // „Oczekuje" znaczy: krok po stronie OTA jeszcze nie wykonany
    db.rows.channels = [channel({ status: "PENDING" })];

    await renderTiles();

    expect(screen.getByText("Oczekuje")).toBeTruthy();
    expect(screen.getByLabelText(/Hotel ID/)).toBeTruthy();
  });

  it("nieznany status nie zostawia pustej pigułki", async () => {
    db.rows.channels = [channel({ status: "COŚ_NOWEGO" })];

    await renderTiles();

    expect(screen.getAllByText("Niepodłączony")).toHaveLength(2);
  });

  it("błąd kanału jest pokazany właścicielowi", async () => {
    // bez tego kanał po prostu „nie działa" i nie ma czego zgłosić
    db.rows.channels = [channel({ status: "ERROR", lastError: "Hotel ID nie istnieje" })];

    await renderTiles();

    expect(screen.getByText("Błąd")).toBeTruthy();
    expect(screen.getByText("Hotel ID nie istnieje")).toBeTruthy();
  });

  it("odświeżenie statusu jest tylko dla kanału, który istnieje", async () => {
    await renderTiles();
    expect(screen.queryByText("Odśwież status")).toBeNull();

    cleanup();
    db.rows.channels = [channel({ status: "PENDING" })];
    await renderTiles();
    expect(screen.getByText("Odśwież status")).toBeTruthy();
  });

  it("odświeżenie niesie typ kanału", async () => {
    db.rows.channels = [channel({ status: "PENDING" })];

    await renderTiles();

    const type = document.querySelector<HTMLInputElement>('input[name="type"]')!;
    expect(type.value).toBe("BOOKING");
  });

  it("Airbnb podłącza się przez OAuth, bez wpisywania identyfikatorów", async () => {
    await renderTiles();

    expect(screen.getByRole("link", { name: /Podłącz Airbnb/ }).getAttribute("href")).toBe(
      "/api/channex/airbnb/start",
    );
  });

  it("podłączony Airbnb nie proponuje ponownej autoryzacji", async () => {
    db.rows.channels = [channel({ type: "AIRBNB", status: "CONNECTED" })];

    await renderTiles();

    expect(screen.queryByRole("link", { name: /Podłącz Airbnb/ })).toBeNull();
    expect(screen.getByText(/Oferty zmapowane automatycznie/)).toBeTruthy();
  });

  it("stan jednego kanału nie przecieka na drugi", async () => {
    // wspólna mapa po typie — pomyłka pokazałaby Airbnb jako podłączony,
    // bo podłączony jest Booking
    db.rows.channels = [channel({ type: "BOOKING", status: "CONNECTED" })];

    await renderTiles();

    expect(within(tile("Booking.com")).getByText("Podłączony")).toBeTruthy();
    expect(within(tile("Airbnb")).getByText("Niepodłączony")).toBeTruthy();
  });
});
