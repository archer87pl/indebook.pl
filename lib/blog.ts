import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

// Blog landingu oparty na plikach Markdown w content/blog/*.md.
// Każdy plik ma nagłówek (frontmatter) między liniami "---" i treść w Markdown.
// Strony są generowane statycznie (pliki są obecne przy `next build`), więc
// dodanie artykułu = commit pliku .md + wdrożenie. Treść jest zaufana (repo).

const BLOG_DIR = join(process.cwd(), "content", "blog");

export type BlogMeta = {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  excerpt: string;
  cover?: string; // ścieżka względem /public, np. /blog/foto.jpg
  author?: string;
  tag?: string;
  readingMinutes: number;
  draft: boolean;
};

export type BlogPost = BlogMeta & { html: string };

/** Prosty parser frontmatteru: bloki key: value między pierwszymi "---". */
function parseFrontmatter(raw: string): {
  data: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    // zdejmij opcjonalne cudzysłowy
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) data[key] = value;
  }
  return { data, body: match[2] };
}

function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function toMeta(slug: string, raw: string): { meta: BlogMeta; body: string } {
  const { data, body } = parseFrontmatter(raw);
  return {
    body,
    meta: {
      slug,
      title: data.title ?? slug,
      date: data.date ?? "1970-01-01",
      excerpt: data.excerpt ?? "",
      cover: data.cover || undefined,
      author: data.author || undefined,
      tag: data.tag || undefined,
      readingMinutes: readingMinutes(body),
      draft: data.draft === "true",
    },
  };
}

function slugFromFile(file: string): string {
  return file.replace(/\.md$/, "");
}

/** Lista nazw plików artykułów (.md, bez README i plików prefiksowanych _). */
function listFiles(): string[] {
  try {
    return readdirSync(BLOG_DIR).filter(
      (f) =>
        f.endsWith(".md") &&
        f.toLowerCase() !== "readme.md" &&
        !f.startsWith("_"),
    );
  } catch {
    return [];
  }
}

/** Wszystkie opublikowane artykuły, od najnowszego. */
export function getPublishedPosts(): BlogMeta[] {
  return listFiles()
    .map((file) => {
      const raw = readFileSync(join(BLOG_DIR, file), "utf8");
      return toMeta(slugFromFile(file), raw).meta;
    })
    .filter((m) => !m.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Najnowsze N artykułów (do sekcji na landingu). */
export function getLatestPosts(n: number): BlogMeta[] {
  return getPublishedPosts().slice(0, n);
}

/** Pojedynczy artykuł z wyrenderowanym HTML; null gdy brak lub szkic. */
export function getPost(slug: string): BlogPost | null {
  const file = listFiles().find((f) => slugFromFile(f) === slug);
  if (!file) return null;
  const raw = readFileSync(join(BLOG_DIR, file), "utf8");
  const { meta, body } = toMeta(slug, raw);
  if (meta.draft) return null;
  const html = marked.parse(body, { gfm: true, async: false }) as string;
  return { ...meta, html };
}

/** Ładna polska data „14 lipca 2026”. */
export function formatBlogDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
