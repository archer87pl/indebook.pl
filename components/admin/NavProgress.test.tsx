// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { NavPending, NavProgressProvider, useReportNavPending } from "./NavProgress";

// Pasek postępu nawigacji panelu. Cała jego wartość leży w SEKWENCJI, której
// nie widać w statycznym renderze: pojawia się po kliknięciu, domyka po
// wczytaniu trasy i dopiero potem znika. Dwa błędy są tu ciche i uciążliwe:
// pasek, który zostaje na ekranie na zawsze, oraz pasek znikający, gdy skończy
// się PIERWSZA z kilku równoległych nawigacji (menu potrafi zgłosić kilka).

const link = vi.hoisted(() => ({ pending: false }));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: link.pending }),
}));

/** Trwanie fazy domykania z NavProgress (musi być zsynchronizowane z CSS-em). */
const DONE_MS = 420;

const bar = () => document.querySelector<HTMLElement>("[aria-hidden] > div");

/**
 * Wykonanie zaplanowanej klatki animacji. Pasek celowo czeka na
 * requestAnimationFrame (żeby przeglądarka zdążyła nałożyć klasę startową),
 * a atrapa zegara odpala ją dopiero po ~16 ms — samo `advanceTimersByTime(0)`
 * niczego by nie uruchomiło.
 */
const settle = async () => {
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  link.pending = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("pojedyncza nawigacja", () => {
  const Nav = () => (
    <NavProgressProvider>
      <NavPending />
    </NavProgressProvider>
  );

  it("w spoczynku paska nie ma w ogóle", async () => {
    render(<Nav />);
    await settle();

    expect(bar()).toBeNull();
  });

  it("rozpoczęta nawigacja pokazuje pasek w fazie biegu", async () => {
    const { rerender } = render(<Nav />);

    link.pending = true;
    rerender(<Nav />);
    await settle();

    expect(bar()!.className).toContain("navprog-run");
  });

  it("po wczytaniu trasy pasek najpierw się domyka, a dopiero potem znika", async () => {
    // natychmiastowe zniknięcie wygląda jak zerwana nawigacja — pasek ma
    // dobiec do końca
    const { rerender } = render(<Nav />);
    link.pending = true;
    rerender(<Nav />);
    await settle();

    link.pending = false;
    rerender(<Nav />);
    await settle();
    expect(bar()!.className).toContain("navprog-done");

    await act(async () => {
      vi.advanceTimersByTime(DONE_MS);
    });
    expect(bar()).toBeNull();
  });

  it("pasek znika dokładnie po czasie animacji, ani chwili wcześniej", async () => {
    // za krótkie okno ucinałoby domknięcie w połowie; liczymy od momentu
    // zakończenia nawigacji, bez pośredniego przewijania zegara
    const { rerender } = render(<Nav />);
    link.pending = true;
    rerender(<Nav />);
    await settle();

    link.pending = false;
    rerender(<Nav />);
    await act(async () => {
      vi.advanceTimersByTime(DONE_MS - 1);
    });
    expect(bar()).not.toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(bar()).toBeNull();
  });

  it("kolejna nawigacja pokazuje pasek od nowa", async () => {
    // pasek jest jednorazowy: druga trasa musi dostać własny bieg,
    // a nie zostać w fazie domykania po poprzedniej
    const { rerender } = render(<Nav />);
    link.pending = true;
    rerender(<Nav />);
    await settle();
    link.pending = false;
    rerender(<Nav />);
    await act(async () => {
      vi.advanceTimersByTime(DONE_MS);
    });

    link.pending = true;
    rerender(<Nav />);
    await settle();

    expect(bar()!.className).toContain("navprog-run");
  });
});

describe("kilka równoległych zgłoszeń", () => {
  // Menu potrafi zgłosić kilka linków naraz (pozycja aktywna + ikona).
  // Licznik ma zejść do zera dopiero po ostatnim.
  const Two = ({ a, b }: { a: boolean; b: boolean }) => (
    <NavProgressProvider>
      {a && <NavPending />}
      {b && <NavPending />}
    </NavProgressProvider>
  );

  it("pasek trwa, dopóki nie skończy się OSTATNIA nawigacja", async () => {
    link.pending = true;
    const { rerender } = render(<Two a b />);
    await settle();

    // pierwsze zgłoszenie znika (link odmontowany), drugie trwa
    rerender(<Two a={false} b />);
    await act(async () => {
      vi.advanceTimersByTime(DONE_MS);
    });

    expect(bar()!.className).toContain("navprog-run");
  });

  it("po ostatnim zgłoszeniu pasek się domyka", async () => {
    link.pending = true;
    const { rerender } = render(<Two a b />);
    await settle();

    rerender(<Two a={false} b={false} />);
    await settle();

    expect(bar()!.className).toContain("navprog-done");
  });
});

describe("useReportNavPending", () => {
  // Wariant dla komponentów, które i tak wołają useLinkStatus (ikona menu).
  const ViaHook = ({ pending }: { pending: boolean }) => {
    useReportNavPending(pending);
    return null;
  };

  it("zgłasza nawigację tak samo jak NavPending", async () => {
    const { rerender } = render(
      <NavProgressProvider>
        <ViaHook pending={false} />
      </NavProgressProvider>,
    );
    await settle();
    expect(bar()).toBeNull();

    rerender(
      <NavProgressProvider>
        <ViaHook pending />
      </NavProgressProvider>,
    );
    await settle();

    expect(bar()!.className).toContain("navprog-run");
  });

  it("poza dostawcą nie wywraca komponentu", async () => {
    // hook bywa użyty w komponencie renderowanym też poza panelem
    expect(() => render(<ViaHook pending />)).not.toThrow();
  });
});

describe("pasek", () => {
  it("jest pomijany przez czytniki i nie łapie kliknięć", async () => {
    // to dekoracja nad treścią — przechwycone kliknięcie blokowałoby menu
    const { rerender } = render(
      <NavProgressProvider>
        <NavPending />
      </NavProgressProvider>,
    );
    link.pending = true;
    rerender(
      <NavProgressProvider>
        <NavPending />
      </NavProgressProvider>,
    );
    await settle();

    const wrapper = bar()!.parentElement!;
    expect(wrapper.getAttribute("aria-hidden")).not.toBeNull();
    expect(wrapper.className).toContain("pointer-events-none");
  });
});
