// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import GalleryLightbox from "./GalleryLightbox";

// Lightbox galerii na stronach WWW obiektów. Cała logika jest w obsłudze
// zdarzeń: zawijanie indeksu na końcach, klawiatura, zamykanie kliknięciem
// w tło ale NIE w samo zdjęcie. E2E kliknęłoby jedno zdjęcie i tyle —
// przewijanie w kółko i różnica „tło kontra zdjęcie" to sprawa na jsdom.

const PHOTOS = [
  { id: 91, path: "/uploads/a.jpg" },
  { id: 92, path: "/uploads/b.jpg" },
  { id: 93, path: "/uploads/c.jpg" },
];

const renderGallery = (photos = PHOTOS) =>
  render(<GalleryLightbox photos={photos} alt="Willa Pod Dębem" />);

const openThumb = (n: number) =>
  userEvent.click(screen.getByLabelText(`Powiększ zdjęcie ${n}`));

const dialog = () => screen.queryByRole("dialog");
/** Zdjęcie w overlayu — miniatury mają inny opis alternatywny. */
const shownPhoto = () =>
  (screen.getByRole("dialog").querySelector("img") as HTMLImageElement).getAttribute("src");

afterEach(cleanup);

describe("miniatury", () => {
  it("każde zdjęcie ma własny przycisk powiększenia i opis alternatywny", () => {
    renderGallery();

    expect(screen.getByLabelText("Powiększ zdjęcie 1")).toBeTruthy();
    expect(screen.getByLabelText("Powiększ zdjęcie 3")).toBeTruthy();
    expect(screen.getByAltText("Willa Pod Dębem — zdjęcie 2")).toBeTruthy();
  });

  it("miniatury wczytują się leniwie — galeria bywa na dole strony", () => {
    renderGallery();

    const thumbs = screen.getAllByRole("img");
    expect(thumbs.every((img) => img.getAttribute("loading") === "lazy")).toBe(true);
  });

  it("bez otwarcia nie ma overlayu", () => {
    renderGallery();
    expect(dialog()).toBeNull();
  });
});

describe("otwieranie i zamykanie", () => {
  it("kliknięcie miniatury otwiera to zdjęcie", async () => {
    renderGallery();

    await openThumb(2);

    expect(shownPhoto()).toBe("/uploads/b.jpg");
  });

  it("overlay mówi czytnikom, które zdjęcie z ilu", async () => {
    renderGallery();

    await openThumb(2);

    expect(screen.getByRole("dialog").getAttribute("aria-label")).toBe(
      "Galeria — zdjęcie 2 z 3"
    );
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("przycisk zamknięcia zamyka overlay", async () => {
    renderGallery();
    await openThumb(1);

    await userEvent.click(screen.getByLabelText("Zamknij"));

    expect(dialog()).toBeNull();
  });

  it("kliknięcie w tło zamyka", async () => {
    renderGallery();
    await openThumb(1);

    await userEvent.click(screen.getByRole("dialog"));

    expect(dialog()).toBeNull();
  });

  it("kliknięcie w samo zdjęcie NIE zamyka", async () => {
    // gość klika zdjęcie, żeby je obejrzeć — zamknięcie byłoby wrogie
    renderGallery();
    await openThumb(1);

    await userEvent.click(screen.getByRole("dialog").querySelector("img")!);

    expect(dialog()).toBeTruthy();
  });

  it("Escape zamyka", async () => {
    renderGallery();
    await openThumb(1);

    await userEvent.keyboard("{Escape}");

    expect(dialog()).toBeNull();
  });
});

describe("przewijanie", () => {
  it("strzałki na ekranie przewijają w przód i w tył", async () => {
    renderGallery();
    await openThumb(1);

    await userEvent.click(screen.getByLabelText("Następne zdjęcie"));
    expect(shownPhoto()).toBe("/uploads/b.jpg");

    await userEvent.click(screen.getByLabelText("Poprzednie zdjęcie"));
    expect(shownPhoto()).toBe("/uploads/a.jpg");
  });

  it("przewijanie strzałkami nie zamyka overlayu", async () => {
    // strzałki leżą na tle, które zamyka po kliknięciu — zdarzenie musi
    // zostać zatrzymane, inaczej każde przewinięcie kończyłoby galerię
    renderGallery();
    await openThumb(1);

    await userEvent.click(screen.getByLabelText("Następne zdjęcie"));

    expect(dialog()).toBeTruthy();
  });

  it("klawiatura przewija w obie strony", async () => {
    renderGallery();
    await openThumb(1);

    await userEvent.keyboard("{ArrowRight}");
    expect(shownPhoto()).toBe("/uploads/b.jpg");

    await userEvent.keyboard("{ArrowLeft}");
    expect(shownPhoto()).toBe("/uploads/a.jpg");
  });

  it("z ostatniego zdjęcia „dalej” wraca na początek", async () => {
    renderGallery();
    await openThumb(3);

    await userEvent.keyboard("{ArrowRight}");

    expect(shownPhoto()).toBe("/uploads/a.jpg");
  });

  it("z pierwszego zdjęcia „wstecz” przechodzi na koniec", async () => {
    // modulo z dodanym rozmiarem tablicy — bez tego indeks zszedłby na −1
    // i overlay zniknąłby bez powodu
    renderGallery();
    await openThumb(1);

    await userEvent.keyboard("{ArrowLeft}");

    expect(shownPhoto()).toBe("/uploads/c.jpg");
  });

  it("pojedyncze zdjęcie zostaje na miejscu przy przewijaniu", async () => {
    renderGallery([PHOTOS[0]]);
    await openThumb(1);

    await userEvent.keyboard("{ArrowRight}");
    expect(shownPhoto()).toBe("/uploads/a.jpg");

    await userEvent.keyboard("{ArrowLeft}");
    expect(shownPhoto()).toBe("/uploads/a.jpg");
  });

  it("po zamknięciu klawiatura już nie działa", async () => {
    // nasłuch musi zostać zdjęty — inaczej strzałki na stronie „otwierałyby"
    // niewidoczną galerię i zjadałyby nawigację
    renderGallery();
    await openThumb(1);
    await userEvent.keyboard("{Escape}");

    await userEvent.keyboard("{ArrowRight}");

    expect(dialog()).toBeNull();
  });
});
