// Komunikat błędu akcji gościa, przetłumaczony na język strony.
// Nieznany kod (stary link, ręcznie podmieniony parametr) degraduje do
// komunikatu ogólnego — nigdy nie renderujemy surowej zawartości z URL-a.
import { getTranslations } from "next-intl/server";
import { isGuestErrorCode } from "@/lib/guest-errors";

export default async function GuestError({
  code,
  n,
}: {
  code?: string;
  n?: string;
}) {
  if (!code) return null;
  const t = await getTranslations("common");
  const count = Number(n);
  const message = isGuestErrorCode(code)
    ? t(`errors.${code}`, { n: Number.isFinite(count) ? count : 0 })
    : t("errors.generic");

  return <p className="alert-error">{message}</p>;
}
