import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function TermsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property) notFound();

  const empty = !property.terms && !property.privacyPolicy;

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <p className="text-sm">
        <Link href={`/o/${property.slug}`} className="text-brand-700 hover:underline">
          ← {property.name}
        </Link>
      </p>

      {empty && (
        <p className="card px-6 py-8 text-center text-slate-500">
          Obiekt nie opublikował jeszcze regulaminu. W sprawach zasad pobytu skontaktuj
          się bezpośrednio z obiektem.
        </p>
      )}

      {property.terms && (
        <section className="space-y-3">
          <h1 className="text-2xl font-bold text-brand-950">Regulamin obiektu</h1>
          <div className="card p-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {property.terms}
          </div>
        </section>
      )}

      {property.privacyPolicy && (
        <section className="space-y-3">
          <h2 className="text-2xl font-bold text-brand-950">Polityka prywatności</h2>
          <div className="card p-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {property.privacyPolicy}
          </div>
        </section>
      )}
    </div>
  );
}
