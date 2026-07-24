// Tłumaczenia wiadomości wysyłanych do gościa (namespace „email").
// Gość dostaje e-maile/SMS-y w języku, w którym rezerwował (Reservation.locale),
// a nie w języku osoby, która akcję wywołała. Wiadomości do właściciela obiektu
// zostają po polsku — panel recepcji jest jednojęzyczny.

import { getTranslations } from "next-intl/server";
import { isAppLocale, routing } from "../i18n/routing";

/**
 * Tłumaczenia „email" dla języka gościa. `locale` pochodzi z bazy, więc
 * nieznaną wartość degradujemy do domyślnego języka zamiast rzucać wyjątkiem.
 * Wołaj PRZED przekazaniem treści do mailAfter/smsAfter — after() nie ma już
 * kontekstu żądania, z którego next-intl czyta konfigurację.
 */
export async function guestT(locale: string) {
  return getTranslations({
    locale: isAppLocale(locale) ? locale : routing.defaultLocale,
    namespace: "email",
  });
}
