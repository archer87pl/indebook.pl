import { getRequestConfig } from "next-intl/server";
import { isAppLocale, routing } from "./routing";
import { loadMessages } from "./load-messages";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = requested && isAppLocale(requested) ? requested : routing.defaultLocale;
  return { locale, messages: await loadMessages(locale) };
});
