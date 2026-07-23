"use client";

// Formularz zapytania na stronie WWW obiektu. Wysyła do /api/sites/inquiry
// (poza rewritem hostów), stan sukcesu/błędu inline. Pole „website" to
// honeypot — ukryte przed ludźmi, wypełniają je boty.

import { useState } from "react";
import { Loader2, Send } from "lucide-react";

export default function InquiryForm({ siteKey }: { siteKey: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/sites/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, siteKey }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Nie udało się wysłać wiadomości.");
      }
      form.reset();
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się wysłać wiadomości.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-2xl border border-[var(--site-text)]/10 bg-[var(--site-surface)] p-8 text-center">
        <p className="text-lg font-bold">Dziękujemy za wiadomość!</p>
        <p className="mt-1 text-sm text-[var(--site-muted)]">
          Odpowiemy najszybciej, jak to możliwe — zwykle w ciągu kilku godzin.
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--site-text)]/15 bg-[var(--site-bg)] px-3 py-2.5 text-sm placeholder:text-[var(--site-muted)]/70 focus:border-[var(--site-primary)] focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required maxLength={120} placeholder="Imię i nazwisko" className={inputCls} aria-label="Imię i nazwisko" />
        <input name="email" type="email" required maxLength={200} placeholder="Adres e-mail" className={inputCls} aria-label="Adres e-mail" />
      </div>
      <input name="phone" maxLength={40} placeholder="Telefon (opcjonalnie)" className={inputCls} aria-label="Telefon" />
      <textarea
        name="message"
        required
        minLength={10}
        maxLength={2000}
        rows={5}
        placeholder="Twoja wiadomość — np. pytanie o termin, liczbę osób, udogodnienia…"
        className={inputCls}
        aria-label="Wiadomość"
      />
      {/* honeypot: niewidoczne dla ludzi */}
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
      />
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={status === "sending"}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--site-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--site-primary-text)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {status === "sending" ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <Send size={15} />
        )}
        Wyślij zapytanie
      </button>
    </form>
  );
}
