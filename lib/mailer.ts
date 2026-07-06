// Wysyłka e-maili: Resend (env RESEND_API_KEY), a bez klucza — log do konsoli.
// Body jest tekstowe; Resend dostaje też prosty wariant HTML.

type Mail = {
  to: string;
  subject: string;
  body: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toHtml(mail: Mail): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
  <p style="font-weight:800;font-size:18px;color:#134e4a">host<span style="color:#0d9488">imo</span></p>
  <p style="white-space:pre-line;color:#0f172a;line-height:1.6">${escapeHtml(mail.body)}</p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:12px;color:#94a3b8">Notelo — rezerwuj bezpośrednio, bez prowizji portali</p>
</div>`;
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
        from: process.env.EMAIL_FROM ?? "Notelo <onboarding@resend.dev>",
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
