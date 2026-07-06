import { prisma } from "./db";

const COMBINING_MARKS = /[̀-ͯ]/g;

export function slugify(s: string): string {
  return (
    s
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .normalize("NFD")
      .replace(COMBINING_MARKS, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "obiekt"
  );
}

export async function uniquePropertySlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  for (let i = 2; ; i++) {
    const existing = await prisma.property.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${i}`;
  }
}
