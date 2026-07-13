import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import Button from "@/components/ui/Button";
import { formatBlogDate, getPost, getPublishedPosts } from "@/lib/blog";
import { appUrl } from "@/lib/payments";

const TEXTURE =
  "repeating-linear-gradient(45deg,#eef3f0,#eef3f0 10px,#e6ede9 10px,#e6ede9 20px)";

// Statyczne generowanie: pliki .md są obecne przy `next build`.
export function generateStaticParams() {
  return getPublishedPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const post = getPost(slug);
  if (!post) return { title: "Artykuł nie znaleziony" };
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      locale: "pl_PL",
      publishedTime: post.date,
      ...(post.cover ? { images: [{ url: post.cover }] } : {}),
    },
  };
}

export default async function BlogPostPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const post = getPost(slug);
  if (!post) notFound();

  const more = getPublishedPosts()
    .filter((p) => p.slug !== post.slug)
    .slice(0, 2);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.date,
    author: { "@type": "Organization", name: post.author ?? "Rezio" },
    publisher: { "@type": "Organization", name: "Rezio" },
    mainEntityOfPage: `${appUrl()}/blog/${post.slug}`,
    ...(post.cover ? { image: `${appUrl()}${post.cover}` } : {}),
  };

  return (
    <article className="mx-auto max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/blog"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
      >
        <ArrowLeft size={14} strokeWidth={2} /> Wszystkie artykuły
      </Link>

      <header className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-400">
          {post.tag && (
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 font-semibold text-brand-700">
              {post.tag}
            </span>
          )}
          <span className="tnum">{formatBlogDate(post.date)}</span>
          <span className="flex items-center gap-1">
            <Clock size={12} strokeWidth={2} /> {post.readingMinutes} min czytania
          </span>
          {post.author && <span>· {post.author}</span>}
        </div>
        <h1 className="text-[32px] font-bold leading-[1.15] tracking-[-0.02em] text-brand-900">
          {post.title}
        </h1>
        <p className="text-[17px] leading-relaxed text-slate-500">{post.excerpt}</p>
      </header>

      {post.cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover}
          alt={post.title}
          className="mt-6 h-64 w-full rounded-[16px] object-cover"
        />
      ) : (
        <div className="mt-6 h-40 rounded-[16px]" style={{ background: TEXTURE }} />
      )}

      <div
        className="prose mt-8"
        dangerouslySetInnerHTML={{ __html: post.html }}
      />

      {/* CTA */}
      <div className="mt-12 overflow-hidden rounded-2xl bg-brand-900 px-7 py-8 text-center text-white">
        <h2 className="text-[22px] font-bold tracking-[-0.02em]">
          Chcesz rezerwacji bez prowizji?
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-[14px] leading-relaxed text-[#a7cbb9]">
          Załóż konto, dodaj pokoje i cennik — Twoja strona rezerwacji ruszy w pół
          godziny. Plan Start jest darmowy.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button variant="accent" href="/rejestracja">
            Zarejestruj obiekt za darmo
          </Button>
          <Button
            href="/#cennik"
            variant="quiet"
            className="border-white/25 bg-transparent text-white hover:bg-white/10"
          >
            Zobacz cennik
          </Button>
        </div>
      </div>

      {/* Więcej artykułów */}
      {more.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-bold text-brand-900">Czytaj dalej</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {more.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="card p-5 transition-all hover:border-brand-600 hover:shadow-md"
              >
                <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
                  {p.tag && (
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700">
                      {p.tag}
                    </span>
                  )}
                  <span className="tnum">{formatBlogDate(p.date)}</span>
                </div>
                <h3 className="font-bold leading-snug text-brand-900">{p.title}</h3>
                <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
