// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import SignaturePad from "./SignaturePad";

// Pole podpisu na karcie meldunkowej. Podpis jest tym, co czyni kartę
// dokumentem, więc dwie rzeczy muszą być pewne: ukryte pole zostaje PUSTE,
// dopóki gość nie pociągnie kreski (inaczej serwer przyjąłby czyste płótno
// jako podpis), a „wyczyść" wraca do stanu wyjściowego, nie do połowicznego.
//
// jsdom nie ma prawdziwego canvasa — podstawiamy kontekst 2D i toDataURL,
// więc test sprawdza kolejność i skutki wywołań, nie same piksele.

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

type Op = { op: string; args: unknown[] };
let ops: Op[] = [];
let contextAvailable = true;

const recorder = (op: string) => (...args: unknown[]) => void ops.push({ op, args });

function stubCanvas() {
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  proto.getContext = function () {
    if (!contextAvailable) return null;
    return {
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 0,
      lineCap: "",
      lineJoin: "",
      fillRect: recorder("fillRect"),
      beginPath: recorder("beginPath"),
      moveTo: recorder("moveTo"),
      lineTo: recorder("lineTo"),
      stroke: recorder("stroke"),
    };
  };
  proto.toDataURL = () => "data:image/png;base64,PODPIS";
}

const canvas = () => document.querySelector("canvas")!;
const hidden = () => document.querySelector('input[name="signature"]') as HTMLInputElement;
const opNames = () => ops.map((o) => o.op);

/** Pociągnięcie: naciśnięcie, ruch, puszczenie. */
function stroke() {
  fireEvent.pointerDown(canvas(), { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas(), { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas(), { pointerId: 1 });
}

beforeEach(() => {
  ops = [];
  contextAvailable = true;
  stubCanvas();
});

afterEach(cleanup);

describe("stan początkowy", () => {
  it("ukryte pole podpisu jest puste, dopóki nie ma kreski", () => {
    // to jest cała ochrona przed „podpisem" w postaci czystego płótna
    render(<SignaturePad />);

    expect(hidden().value).toBe("");
  });

  it("płótno startuje wypełnione na biało — karta ma być czytelna w druku", () => {
    render(<SignaturePad />);

    expect(opNames()).toContain("fillRect");
  });

  it("pokazuje podpowiedź, a nie potwierdzenie", () => {
    render(<SignaturePad />);

    expect(screen.getByText("signaturePad.hint")).toBeTruthy();
    expect(screen.queryByText(/signaturePad.done/)).toBeNull();
  });

  it("bufor płótna ma stały rozmiar, niezależny od układu strony", () => {
    // rozmiar zależny od layoutu w chwili montowania dawałby podpis
    // rozciągnięty albo przycięty na wydruku
    render(<SignaturePad />);

    expect(canvas().getAttribute("width")).toBe("560");
    expect(canvas().getAttribute("height")).toBe("160");
  });
});

describe("rysowanie", () => {
  it("pociągnięcie zapisuje obraz do ukrytego pola", () => {
    render(<SignaturePad />);

    stroke();

    expect(hidden().value).toBe("data:image/png;base64,PODPIS");
  });

  it("po pociągnięciu widać potwierdzenie", () => {
    render(<SignaturePad />);

    stroke();

    expect(screen.getByText(/signaturePad.done/)).toBeTruthy();
  });

  it("samo naciśnięcie bez ruchu rysuje kropkę i już jest podpisem", () => {
    // tapnięcie palcem na telefonie to często jedno zdarzenie bez ruchu
    render(<SignaturePad />);

    fireEvent.pointerDown(canvas(), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { pointerId: 1 });

    expect(opNames()).toEqual(expect.arrayContaining(["moveTo", "lineTo", "stroke"]));
    expect(hidden().value).toContain("data:image/png");
  });

  it("ruch bez wcześniejszego naciśnięcia niczego nie rysuje", () => {
    // przesunięcie kursora nad polem nie może zostawiać śladu
    render(<SignaturePad />);
    ops = [];

    fireEvent.pointerMove(canvas(), { clientX: 40, clientY: 30, pointerId: 1 });

    expect(opNames()).not.toContain("stroke");
    expect(hidden().value).toBe("");
  });

  it("puszczenie bez rysowania nie zapisuje pustego płótna", () => {
    render(<SignaturePad />);

    fireEvent.pointerUp(canvas(), { pointerId: 1 });

    expect(hidden().value).toBe("");
    expect(screen.getByText("signaturePad.hint")).toBeTruthy();
  });

  it("przerwane pociągnięcie (pointercancel) też zapisuje to, co narysowano", () => {
    // przeciągnięcie palcem za krawędź ekranu nie może zgubić podpisu
    render(<SignaturePad />);

    fireEvent.pointerDown(canvas(), { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerCancel(canvas(), { pointerId: 1 });

    expect(hidden().value).toContain("data:image/png");
  });

  it("drugie pociągnięcie dokłada się do pierwszego, nie zaczyna od zera", () => {
    render(<SignaturePad />);
    stroke();
    ops = [];

    stroke();

    // brak fillRect między pociągnięciami = płótno nie zostało wyczyszczone
    expect(opNames()).not.toContain("fillRect");
  });
});

describe("czyszczenie", () => {
  it("zeruje ukryte pole i wraca do podpowiedzi", () => {
    render(<SignaturePad />);
    stroke();
    expect(hidden().value).not.toBe("");

    fireEvent.click(screen.getByText("signaturePad.clear"));

    expect(hidden().value).toBe("");
    expect(screen.getByText("signaturePad.hint")).toBeTruthy();
  });

  it("zamalowuje płótno na biało, a nie tylko czyści pole", () => {
    // pole puste przy widocznej kresce wyglądałoby jak awaria formularza
    render(<SignaturePad />);
    stroke();
    ops = [];

    fireEvent.click(screen.getByText("signaturePad.clear"));

    expect(opNames()).toContain("fillRect");
  });

  it("po wyczyszczeniu da się podpisać ponownie", () => {
    render(<SignaturePad />);
    stroke();
    fireEvent.click(screen.getByText("signaturePad.clear"));

    stroke();

    expect(hidden().value).toContain("data:image/png");
  });

  it("przycisk czyszczenia nie wysyła formularza", () => {
    // podpis stoi w formularzu meldunku — type="submit" wysyłałby go
    // przy każdej próbie poprawienia kreski
    render(<SignaturePad />);

    expect(screen.getByText("signaturePad.clear").getAttribute("type")).toBe("button");
  });
});

describe("brak kontekstu 2D", () => {
  it("płótno bez kontekstu nie wywraca formularza meldunku", () => {
    // przeglądarka z wyłączonym canvasem (albo tryb prywatności) nie może
    // uniemożliwić wypełnienia reszty karty
    contextAvailable = false;

    expect(() => {
      render(<SignaturePad />);
      stroke();
    }).not.toThrow();
    expect(hidden().value).toBe("");
  });
});
