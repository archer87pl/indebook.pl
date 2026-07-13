import { type Page, expect } from "@playwright/test";

/** Unikalny znacznik przebiegu — dane testowe nie zderzają się między uruchomieniami. */
export const RUN = Date.now().toString(36);

export const DEMO = { email: "demo@rezio.pl", password: "demo1234" };
export const PROPERTY_SLUG = "willa-rezio";

/**
 * Losowe okno dat per przebieg (120–4000 dni w przód): kolejne uruchomienia
 * nie kumulują rezerwacji na tych samych datach (jednostek jest skończenie
 * wiele, a powtarzalny stały offset wyczerpałby je po kilku przebiegach).
 */
const DAY_OFFSET = 120 + Math.floor(Math.random() * 3800);

/** Data ISO przesunięta o `days` dni względem okna przebiegu. */
export function futureISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + DAY_OFFSET + days);
  return d.toISOString().slice(0, 10);
}

/** Logowanie do panelu recepcji kontem demo. */
export async function loginAsOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(DEMO.email);
  await page.getByLabel(/^Hasło/).fill(DEMO.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** Rysuje krótki zygzak na canvasie podpisu (SignaturePad wymaga pociągnięcia). */
export async function drawSignature(page: Page) {
  const canvas = page.locator("canvas");
  // canvas bywa poza viewportem — współrzędne myszy liczą się od okna
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas podpisu niewidoczny");
  const startX = box.x + box.width * 0.25;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  await page.mouse.move(startX + 60, y - 20, { steps: 6 });
  await page.mouse.move(startX + 120, y + 20, { steps: 6 });
  await page.mouse.move(startX + 180, y - 10, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText("Podpis złożony")).toBeVisible();
}
