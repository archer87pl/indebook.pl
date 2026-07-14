import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";

// ISR: regulamin to statyczny tekst — cache z odświeżaniem co 10 min
export const revalidate = 600;

export default async function TermsPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const property = await prisma.property.findUnique({ where: { slug } });
  if (!property) notFound();

  const empty = !property.terms && !property.privacyPolicy;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <p>
        <Link
          href={`/o/${property.slug}`}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 hover:text-brand-700 hover:underline"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          {property.name}
        </Link>
      </p>

      {empty && (
        <Card>
          <EmptyState
            icon={<FileText size={26} strokeWidth={2} />}
            title="Brak opublikowanego regulaminu"
            description="Obiekt nie opublikował jeszcze regulaminu. W sprawach zasad pobytu skontaktuj się bezpośrednio z obiektem."
          />
        </Card>
      )}

      {property.terms && (
        <section className="space-y-3">
          <h1 className="text-[25px] font-bold text-brand-950">Regulamin obiektu</h1>
          <Card>
            <CardBody className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-600">
              {property.terms}
            </CardBody>
          </Card>
        </section>
      )}

      {property.privacyPolicy && (
        <section className="space-y-3">
          <h2 className="text-[25px] font-bold text-brand-950">Polityka prywatności</h2>
          <Card>
            <CardBody className="whitespace-pre-line text-[13.5px] leading-relaxed text-slate-600">
              {property.privacyPolicy}
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}
