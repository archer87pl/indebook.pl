import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  formatBlogDate,
  getLatestPosts,
  getPost,
  getPublishedPosts,
} from "./blog";

// Poradnik (content/blog) czyta pliki .md z dysku przy renderze. BLOG_DIR jest
// ustalany przy imporcie modułu, więc testy pracują na prawdziwym katalogu —
// artykuły testowe dokładamy na chwilę i sprzątamy w finally.

const BLOG_DIR = join(process.cwd(), "content", "blog");
const temps: string[] = [];

function addPost(name: string, content: string): string {
  const file = join(BLOG_DIR, name);
  writeFileSync(file, content, "utf8");
  temps.push(file);
  return file;
}

afterEach(() => {
  for (const file of temps.splice(0)) {
    if (existsSync(file)) rmSync(file);
  }
});

describe("getPublishedPosts", () => {
  it("czyta prawdziwe artykuły z repozytorium", () => {
    const posts = getPublishedPosts();
    expect(posts.length).toBeGreaterThan(0);
  });

  it("każdy artykuł ma komplet danych do listy i karty", () => {
    for (const post of getPublishedPosts()) {
      expect(post.slug, "slug").toMatch(/^[a-z0-9-]+$/);
      expect(post.title.length, `tytuł ${post.slug}`).toBeGreaterThan(0);
      expect(post.date, `data ${post.slug}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.excerpt.length, `zajawka ${post.slug}`).toBeGreaterThan(0);
      expect(post.readingMinutes, `czas czytania ${post.slug}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("slugi się nie powtarzają", () => {
    const slugs = getPublishedPosts().map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("sortuje od najnowszego", () => {
    addPost(
      "zzz-test-najnowszy.md",
      "---\ntitle: Najnowszy\ndate: 2099-12-31\nexcerpt: Test\n---\nTreść testowa.\n"
    );

    expect(getPublishedPosts()[0].slug).toBe("zzz-test-najnowszy");
  });

  it("szkic nie trafia na listę", () => {
    addPost(
      "zzz-test-szkic.md",
      "---\ntitle: Szkic\ndate: 2099-12-31\nexcerpt: Test\ndraft: true\n---\nTreść.\n"
    );

    expect(getPublishedPosts().some((p) => p.slug === "zzz-test-szkic")).toBe(false);
  });

  it("plik z podkreśleniem na początku jest pominięty (materiał roboczy)", () => {
    addPost("_zzz-test-roboczy.md", "---\ntitle: Roboczy\ndate: 2099-12-31\n---\nTreść.\n");

    expect(getPublishedPosts().some((p) => p.slug.includes("roboczy"))).toBe(false);
  });

  it("zdejmuje cudzysłowy z wartości frontmatteru", () => {
    addPost(
      "zzz-test-cudzyslowy.md",
      `---\ntitle: "Ceny w sezonie"\nexcerpt: 'Jak liczyć'\ndate: 2099-12-30\n---\nTreść.\n`
    );

    const post = getPublishedPosts().find((p) => p.slug === "zzz-test-cudzyslowy")!;
    expect(post.title).toBe("Ceny w sezonie");
    expect(post.excerpt).toBe("Jak liczyć");
  });

  it("brak tytułu degraduje do slugu, brak daty do epoki", () => {
    // artykuł bez frontmatteru nadal ma się wyrenderować, tylko na końcu listy
    addPost("zzz-test-bez-naglowka.md", "Sama treść bez frontmatteru.\n");

    const post = getPublishedPosts().find((p) => p.slug === "zzz-test-bez-naglowka")!;
    expect(post.title).toBe("zzz-test-bez-naglowka");
    expect(post.date).toBe("1970-01-01");
  });

  it("czas czytania liczy się z treści, nie z frontmatteru", () => {
    addPost(
      "zzz-test-dlugi.md",
      `---\ntitle: Długi\ndate: 2099-12-29\nexcerpt: Test\n---\n${"slowo ".repeat(600)}\n`
    );

    const post = getPublishedPosts().find((p) => p.slug === "zzz-test-dlugi")!;
    expect(post.readingMinutes).toBe(3); // 600 słów / 200 na minutę
  });
});

describe("getLatestPosts", () => {
  it("oddaje nie więcej niż zamówiono", () => {
    expect(getLatestPosts(2).length).toBeLessThanOrEqual(2);
  });

  it("bierze najnowsze, w tej samej kolejności co pełna lista", () => {
    const all = getPublishedPosts();
    expect(getLatestPosts(2)).toEqual(all.slice(0, 2));
  });
});

describe("getPost", () => {
  it("renderuje markdown do HTML", () => {
    addPost(
      "zzz-test-render.md",
      "---\ntitle: Render\ndate: 2099-12-28\nexcerpt: Test\n---\n## Nagłówek\n\nAkapit z **wytłuszczeniem**.\n"
    );

    const post = getPost("zzz-test-render")!;
    expect(post.html).toContain("<h2");
    expect(post.html).toContain("<strong>wytłuszczeniem</strong>");
  });

  it("nieznany slug daje null, a nie wyjątek", () => {
    expect(getPost("nie-ma-takiego-artykulu")).toBeNull();
  });

  it("szkic jest niedostępny także po bezpośrednim adresie", () => {
    addPost(
      "zzz-test-szkic-2.md",
      "---\ntitle: Szkic\ndate: 2099-12-27\ndraft: true\n---\nTreść.\n"
    );

    expect(getPost("zzz-test-szkic-2")).toBeNull();
  });

  it("slug z URL nie wychodzi poza katalog artykułów", () => {
    // slug trafia tu wprost z adresu; dopasowanie do listy plików sprawia,
    // że próba wyjścia w górę drzewa nie ma jak zadziałać
    expect(getPost("../../package")).toBeNull();
    expect(getPost("../../../etc/passwd")).toBeNull();
  });
});

describe("formatBlogDate", () => {
  it("zapisuje datę po polsku", () => {
    expect(formatBlogDate("2026-07-14")).toBe("14 lipca 2026");
  });

  it("nie przesuwa dnia przez strefę czasową", () => {
    // data bez godziny parsowana jako UTC potrafi cofnąć się o dobę
    expect(formatBlogDate("2026-01-01")).toBe("1 stycznia 2026");
    expect(formatBlogDate("2026-12-31")).toBe("31 grudnia 2026");
  });
});
