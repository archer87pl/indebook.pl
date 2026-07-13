import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { formatBlogDate, getPublishedPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — poradnik dla obiektów noclegowych",
  description:
    "Praktyczne porady o rezerwacjach bez prowizji, meldunku online, cenach dynamicznych i prowadzeniu obiektu noclegowego. Wiedza z Rezio.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog Rezio — poradnik dla obiektów noclegowych",
    type: "website",
    locale: "pl_PL",
  },
};

const TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 10px,#e6ede9 10px,#e6ede9 20px)";

export default function BlogIndexPage() {
  const posts = getPublishedPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="space-y-10">
      <header className="max-w-2xl">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.17em] text-brand-600">
          Poradnik Rezio
        </p>
        <h1 className="mt-2 text-[32px] font-bold leading-tight tracking-[-0.02em] text-brand-900">
          Wiedza, która pomaga sprzedawać bezpośrednio
        </h1>
        <p className="mt-2 text-slate-500">
          Prowizje, meldunek online, ceny dynamiczne i codzienna obsługa gościa —
          konkretnie, bez lania wody.
        </p>
      </header>

      {posts.length === 0 && (
        <p className="card px-6 py-12 text-center text-slate-500">
          Pierwsze artykuły pojawią się już wkrótce.
        </p>
      )}

      {/* Wyróżniony najnowszy */}
      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className="card group grid gap-0 overflow-hidden transition-all hover:border-brand-600 hover:shadow-lg md:grid-cols-2"
        >
          <div
            className="min-h-[200px] bg-cover bg-center"
            style={
              featured.cover
                ? { backgroundImage: `url(${featured.cover})` }
                : { background: TEXTURE }
            }
          />
          <div className="flex flex-col justify-center gap-3 p-7">
            <div className="flex items-center gap-2 text-[11.5px] text-slate-400">
              {featured.tag && (
                <span className="rounded-full bg-brand-100 px-2.5 py-0.5 font-semibold text-brand-700">
                  {featured.tag}
                </span>
              )}
              <span className="tnum">{formatBlogDate(featured.date)}</span>
              <span className="flex items-center gap-1">
                <Clock size={12} strokeWidth={2} /> {featured.readingMinutes} min
              </span>
            </div>
            <h2 className="text-[22px] font-bold leading-tight tracking-[-0.01em] text-brand-900">
              {featured.title}
            </h2>
            <p className="text-[14px] leading-relaxed text-slate-600">
              {featured.excerpt}
            </p>
            <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
              Czytaj artykuł
              <ArrowRight
                size={15}
                strokeWidth={2}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </Link>
      )}

      {/* Pozostałe */}
      {rest.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="card group flex flex-col overflow-hidden transition-all hover:border-brand-600 hover:shadow-md"
            >
              <div
                className="h-40 bg-cover bg-center"
                style={
                  post.cover
                    ? { backgroundImage: `url(${post.cover})` }
                    : { background: TEXTURE }
                }
              />
              <div className="flex flex-1 flex-col gap-2 p-5">
                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  {post.tag && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">
                      {post.tag}
                    </span>
                  )}
                  <span className="tnum">{formatBlogDate(post.date)}</span>
                </div>
                <h2 className="text-[16px] font-bold leading-snug text-brand-900">
                  {post.title}
                </h2>
                <p className="line-clamp-3 flex-1 text-[13px] leading-relaxed text-slate-600">
                  {post.excerpt}
                </p>
                <span className="flex items-center gap-1 text-[11.5px] text-slate-400">
                  <Clock size={12} strokeWidth={2} /> {post.readingMinutes} min czytania
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
