// Błędy akcji gościa wracają jako KOD, nie jako gotowy tekst — dzięki temu
// komunikat tłumaczy się w języku, w którym gość ogląda stronę. Wcześniej
// server action wstawiał polskie zdanie do URL-a i Niemiec dostawał je
// dosłownie na przetłumaczonej stronie.
//
// Część komunikatów ma liczbę (maks. gości, min. nocy, limit znaków) —
// przekazujemy ją osobnym parametrem `n`, a tłumaczenie wstawia ją przez ICU.

export const GUEST_ERROR_CODES = [
  "invalidRange",
  "pastArrival",
  "guestsRequired",
  "nameRequired",
  "emailInvalid",
  "rodoRequired",
  "propertySuspended",
  "maxGuests",
  "minStay",
  "notChangeable",
  "stayStarted",
  "guestsRange",
  "nothingChanged",
  "checkInDone",
  "checkInUnavailable",
  "addressRequired",
  "citizenshipRequired",
  "docTypeInvalid",
  "docTypeRequired",
  "docNumberInvalid",
  "plateInvalid",
  "arrivalTimeInvalid",
  "reviewDone",
  "reviewTooEarly",
  "ratingRequired",
  "reviewTooLong",
  "reviewConsentRequired",
  "promoInvalid",
  "datesJustTaken",
  "noRoomsForNewDates",
  "termsRequired",
  "signatureRequired",
  "additionalGuestName",
  "additionalGuestBirthDate",
  "tooManyRequests",
] as const;

export type GuestErrorCode = (typeof GUEST_ERROR_CODES)[number];

const KNOWN = new Set<string>(GUEST_ERROR_CODES);

/** Czy parametr z URL-a jest znanym kodem — chroni przed renderem śmiecia. */
export function isGuestErrorCode(value: string): value is GuestErrorCode {
  return KNOWN.has(value);
}

/** Fragment query stringa z kodem błędu (i opcjonalną liczbą do komunikatu). */
export function guestErrorQuery(code: GuestErrorCode, n?: number): string {
  return n === undefined ? `error=${code}` : `error=${code}&n=${n}`;
}
