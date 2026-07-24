import { getTranslations } from "next-intl/server";
import { Ticket } from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { findReservation } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function MyReservationPage(props: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const sp = await props.searchParams;
  const t = await getTranslations("account");
  return (
    <div className="mx-auto mt-12 max-w-sm space-y-5">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <Ticket size={22} strokeWidth={2} />
        </div>
        <h1 className="text-[25px] font-bold text-brand-950">{t("title")}</h1>
        <p className="text-[13px] leading-relaxed text-slate-500">{t("intro")}</p>
      </div>

      {sp.error && <p className="alert-error">{t("notFound")}</p>}

      <Card>
        <CardBody>
          <form action={findReservation} className="space-y-4">
            <label className="label">
              {t("code")}
              <input
                name="code"
                required
                placeholder={t("codePlaceholder")}
                defaultValue={sp.code ?? ""}
                className="input tnum w-full font-semibold uppercase"
              />
            </label>
            <label className="label">
              {t("email")}
              <input type="email" name="email" required className="input w-full" />
            </label>
            <Button type="submit" size="lg" className="w-full">
              {t("submit")}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
