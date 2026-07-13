// Wysyłka e-maili: Resend (env RESEND_API_KEY), a bez klucza — log do konsoli.
// Body jest tekstowe; do Resend idzie też wariant HTML w szablonie 19/20:
// zielony header z logo, biała karta treści, jeden primary CTA, stopka ≤560px.

import { appUrl } from "./payments";

type Mail = {
  to: string;
  subject: string;
  body: string;
  /** Nagłówek w karcie (domyślnie temat). */
  heading?: string;
  /** Przycisk CTA — pierwszy link z body jest używany automatycznie, gdy brak. */
  cta?: { label: string; url: string };
  /** Linia stopki (np. nazwa obiektu · adres). */
  footer?: string;
};

const URL_RE = /https?:\/\/[^\s<>"]+|(?<=\s|^)\/(?:r|o|admin|reset-hasla)\/[^\s<>"]+/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Zamienia URL-e w zeskejpowanym tekście na klikalne linki (względne → absolutne). */
function linkify(escaped: string): string {
  return escaped.replace(URL_RE, (url) => {
    const href = url.startsWith("/") ? `${appUrl()}${url}` : url;
    return `<a href="${href}" style="color:#1f7a4d;font-weight:600;word-break:break-all">${url}</a>`;
  });
}

function toHtml(mail: Mail): string {
  const cta = mail.cta ?? extractCta(mail.body);
  return `<div style="background:#f4f6f5;padding:24px 12px;font-family:'Space Grotesk',system-ui,sans-serif;color:#132a20">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6ede9;border-radius:16px;overflow:hidden">
    <div style="background:#123829;padding:22px;text-align:center">
      <span style="display:inline-block;width:28px;height:28px;border-radius:8px;background:#4ade9b;color:#0d2b1e;font-size:19px;font-weight:700;line-height:28px;letter-spacing:-.04em;vertical-align:middle">R</span>
      <span style="font-weight:700;font-size:17px;color:#ffffff;letter-spacing:-.02em;vertical-align:middle;margin-left:9px">Rezio</span>
    </div>
    <div style="padding:26px">
      <h1 style="font-size:19px;font-weight:700;letter-spacing:-.02em;margin:0 0 12px;text-align:center">${escapeHtml(mail.heading ?? mail.subject)}</h1>
      <p style="white-space:pre-line;font-size:13.5px;color:#4d6459;line-height:1.65;margin:0">${linkify(escapeHtml(mail.body))}</p>
      ${
        cta
          ? `<a href="${cta.url}" style="display:block;text-align:center;text-decoration:none;height:46px;line-height:46px;font-size:13.5px;font-weight:700;color:#ffffff;background:#123829;border-radius:11px;margin-top:20px">${escapeHtml(cta.label)}</a>`
          : ""
      }
    </div>
    <div style="background:#f7faf8;border-top:1px solid #eef3f0;padding:15px 26px;text-align:center">
      <div style="font-size:11.5px;font-weight:700">${escapeHtml(mail.footer ?? "Rezio")}</div>
      <div style="font-size:10.5px;color:#8ba498;margin-top:2px">rezerwuj bezpośrednio, bez prowizji portali</div>
    </div>
  </div>
</div>`;
}

/** Bez jawnego CTA: pierwszy pełny URL z treści staje się przyciskiem. */
function extractCta(body: string): { label: string; url: string } | null {
  const url = body.match(/https?:\/\/[^\s<>"]+/)?.[0];
  return url ? { label: "Otwórz →", url } : null;
}

export async function sendMail(mail: Mail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `[MAIL] do: ${mail.to}\n[MAIL] temat: ${mail.subject}\n${mail.body}\n`
    );
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Rezio <onboarding@resend.dev>",
        to: [mail.to],
        subject: mail.subject,
        text: mail.body,
        html: toHtml(mail),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`[MAIL] Resend HTTP ${res.status}: ${await res.text()}`);
    }
  } catch (e) {
    // e-mail nie może wywracać rezerwacji — logujemy i jedziemy dalej
    console.error("[MAIL] błąd wysyłki:", e);
  }
}
