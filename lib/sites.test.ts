import { describe, expect, it } from "vitest";
import { siteRevalidatePaths } from "./sites";

describe("siteRevalidatePaths", () => {
  it("bez domeny własnej — tylko ścieżka subdomeny", () => {
    expect(siteRevalidatePaths({ subdomain: "willa", customDomain: null })).toEqual([
      "/sites/willa",
    ]);
  });

  it("z domeną własną — obie ścieżki (cache trzyma osobne wpisy per host)", () => {
    expect(
      siteRevalidatePaths({ subdomain: "willa", customDomain: "mojobiekt.pl" })
    ).toEqual(["/sites/willa", "/sites/mojobiekt.pl"]);
  });
});
