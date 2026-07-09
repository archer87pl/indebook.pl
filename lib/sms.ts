// Wysyłka SMS: SMSAPI.pl (env SMSAPI_TOKEN), a bez tokenu — log do konsoli.
// Nadawca: env SMS_FROM (zarejestrowane pole nadawcy w SMSAPI) albo "ECO"
// (SMS ekonomiczny z losowego numeru — działa bez rejestracji nadpisu, taniej).

type Sms = {
  to: string;
  body: string;
};

/**
 * Normalizacja numeru do formatu +48XXXXXXXXX.
 * 9 cyfr traktujemy jako polski numer bez prefiksu. Zwraca null, gdy numer
 * nie nadaje się do wysyłki (wtedy SMS po prostu pomijamy).
 */
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/[\s\-().]/g, "");
  if (/^\+\d{9,15}$/.test(s)) return s;
  if (/^00\d{9,15}$/.test(s)) return `+${s.slice(2)}`;
  if (/^48\d{9}$/.test(s)) return `+${s}`;
  if (/^\d{9}$/.test(s)) return `+48${s}`;
  return null;
}

export async function sendSms(sms: Sms): Promise<void> {
  const phone = normalizePhone(sms.to);
  if (!phone) return;

  const token = process.env.SMSAPI_TOKEN;
  if (!token) {
    console.log(`[SMS] do: ${phone}\n${sms.body}\n`);
    return;
  }

  try {
    const res = await fetch("https://api.smsapi.pl/sms.do", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        to: phone,
        message: sms.body,
        from: process.env.SMS_FROM || "ECO",
        format: "json",
        encoding: "utf-8",
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { error?: number; message?: string }
      | null;
    if (!res.ok || data?.error) {
      console.error(
        `[SMS] SMSAPI HTTP ${res.status}, błąd ${data?.error ?? "?"}: ${data?.message ?? ""}`
      );
    }
  } catch (e) {
    // SMS nie może wywracać rezerwacji — logujemy i jedziemy dalej
    console.error("[SMS] błąd wysyłki:", e);
  }
}
