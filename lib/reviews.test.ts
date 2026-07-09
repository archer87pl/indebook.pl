import { describe, expect, it } from "vitest";
import { addDaysISO, todayISO } from "./dates";
import {
  averageRating,
  canReview,
  displayAuthor,
  isValidRating,
  stars,
} from "./reviews";

describe("isValidRating", () => {
  it("akceptuje 1–5, odrzuca resztę", () => {
    expect(isValidRating(1)).toBe(true);
    expect(isValidRating(5)).toBe(true);
    expect(isValidRating(0)).toBe(false);
    expect(isValidRating(6)).toBe(false);
    expect(isValidRating(3.5)).toBe(false);
    expect(isValidRating(NaN)).toBe(false);
  });
});

describe("displayAuthor", () => {
  it("skraca do imienia + inicjału nazwiska", () => {
    expect(displayAuthor("Anna Kowalska")).toBe("Anna K.");
    expect(displayAuthor("Jan Nowak Kowalski")).toBe("Jan K.");
    expect(displayAuthor("Anna")).toBe("Anna");
    expect(displayAuthor("  Piotr   Zieliński ")).toBe("Piotr Z.");
    expect(displayAuthor("")).toBe("Gość");
  });
});

describe("averageRating", () => {
  it("liczy średnią z zaokrągleniem do 1 miejsca", () => {
    expect(averageRating([5, 4, 5])).toBe(4.7);
    expect(averageRating([5, 5, 5])).toBe(5);
    expect(averageRating([1, 2])).toBe(1.5);
  });
  it("zwraca 0 dla braku opinii", () => {
    expect(averageRating([])).toBe(0);
  });
});

describe("stars", () => {
  it("renderuje gwiazdki pełne i puste", () => {
    expect(stars(5)).toBe("★★★★★");
    expect(stars(3)).toBe("★★★☆☆");
    expect(stars(0)).toBe("☆☆☆☆☆");
    expect(stars(4.6)).toBe("★★★★★"); // zaokrągla
  });
});

describe("canReview", () => {
  it("można po zakończonym pobycie bez istniejącej opinii", () => {
    expect(
      canReview({ status: "CONFIRMED", checkOut: addDaysISO(todayISO(), -1), hasReview: false })
    ).toBe(true);
    // dzień wymeldowania też się liczy
    expect(
      canReview({ status: "CONFIRMED", checkOut: todayISO(), hasReview: false })
    ).toBe(true);
  });

  it("nie można przed wymeldowaniem, dla PENDING/CANCELLED ani przy istniejącej opinii", () => {
    expect(
      canReview({ status: "CONFIRMED", checkOut: addDaysISO(todayISO(), 1), hasReview: false })
    ).toBe(false);
    expect(
      canReview({ status: "PENDING", checkOut: addDaysISO(todayISO(), -1), hasReview: false })
    ).toBe(false);
    expect(
      canReview({ status: "CONFIRMED", checkOut: addDaysISO(todayISO(), -1), hasReview: true })
    ).toBe(false);
  });
});
