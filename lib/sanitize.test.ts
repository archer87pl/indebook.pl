import { describe, expect, it } from "vitest";
import { sanitizeCss, sanitizeCustomHtml, sanitizeRichText } from "./sanitize";

describe("sanitizeRichText — pola opisowe", () => {
  it("zachowuje podstawowe formatowanie", () => {
    const out = sanitizeRichText("<p>Ala <b>ma</b> <em>kota</em></p><ul><li>x</li></ul>");
    expect(out).toContain("<b>ma</b>");
    expect(out).toContain("<li>x</li>");
  });

  it("wycina script i zdarzenia on*", () => {
    const out = sanitizeRichText('<p onclick="zle()">a</p><script>alert(1)</script>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("a");
  });

  it("usuwa javascript: z linków, zachowuje https i mailto", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).not.toContain("javascript:");
    expect(sanitizeRichText('<a href="https://ok.pl">x</a>')).toContain('href="https://ok.pl"');
    expect(sanitizeRichText('<a href="mailto:a@b.pl">x</a>')).toContain("mailto:a@b.pl");
  });

  it("nie przepuszcza obrazków ani iframe (to nie miejsce na nie)", () => {
    expect(sanitizeRichText('<img src="x.jpg"><iframe src="https://youtube.com/embed/x"></iframe>')).not.toMatch(/img|iframe/);
  });
});

describe("sanitizeCustomHtml — sekcja Własny kod", () => {
  it("przepuszcza strukturę, obrazki i style inline", () => {
    const out = sanitizeCustomHtml('<div class="a" style="color:red"><img src="https://x.pl/a.jpg" alt="a"><h2>Tytuł</h2></div>');
    expect(out).toContain('class="a"');
    expect(out).toContain("style=");
    expect(out).toContain("<img");
    expect(out).toContain("<h2>Tytuł</h2>");
  });

  it("wycina script niezależnie od zapisu", () => {
    const out = sanitizeCustomHtml('<SCRIPT>x</SCRIPT><div onmouseover="x()">a</div>');
    expect(out.toLowerCase()).not.toContain("script");
    expect(out).not.toContain("onmouseover");
  });

  it("iframe tylko z dozwolonych hostów (YouTube, mapy)", () => {
    expect(
      sanitizeCustomHtml('<iframe src="https://www.youtube.com/embed/abc"></iframe>')
    ).toContain("youtube.com");
    expect(
      sanitizeCustomHtml('<iframe src="https://zlo.example.com/x"></iframe>')
    ).not.toContain("zlo.example.com");
  });
});

describe("sanitizeCss", () => {
  it("neutralizuje próbę zamknięcia tagu style", () => {
    const out = sanitizeCss("body{color:red}</style><script>alert(1)</script>");
    expect(out).not.toContain("</style");
    expect(out).not.toContain("<script");
    expect(out).toContain("body{color:red}");
  });

  it("usuwa @import i expression(), zostawia url() tła", () => {
    const out = sanitizeCss(
      '@import url("//evil.com/x"); body{ width: expression(alert(1)); background:url("/blob/a.jpg") }'
    );
    expect(out).not.toMatch(/@import/i);
    expect(out).not.toMatch(/expression\s*\(/i);
    expect(out).toContain("background:url");
  });
});
