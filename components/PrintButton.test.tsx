// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PrintButton from "./PrintButton";

// Przycisk druku karty meldunkowej i faktury. Krótki, ale ma dwie rzeczy,
// które łatwo zepsuć: musi być type="button" (w formularzu karty submit
// wysyłałby akcję zamiast drukować) i sam nie może trafić na wydruk.

afterEach(cleanup);

describe("PrintButton", () => {
  it("wywołuje druk przeglądarki", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<PrintButton />);

    await userEvent.click(screen.getByRole("button", { name: "Drukuj" }));

    expect(print).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("nie jest przyciskiem wysyłki — stoi w formularzu karty meldunkowej", () => {
    render(<PrintButton />);

    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("sam nie trafia na wydruk", () => {
    // przycisk „Drukuj" na wydrukowanej fakturze wyglądałby jak błąd
    render(<PrintButton />);

    expect(screen.getByRole("button").className).toContain("print:hidden");
  });

  it("etykietę można podmienić", () => {
    render(<PrintButton label="Drukuj fakturę" />);

    expect(screen.getByRole("button", { name: "Drukuj fakturę" })).toBeTruthy();
  });
});
