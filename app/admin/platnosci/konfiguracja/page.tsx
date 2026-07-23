import Link from "next/link";
import { FileText, PlugZap } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  clearPaymentSettings,
  testP24Connection,
  updatePaymentSettings,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { p24Configured } from "@/lib/payments";
import { maskSecret } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Konfiguracja płatności online obiektu (Przelewy24). Właściciel podpina
 * własne konto P24 — zaliczki gości trafiają bezpośrednio na jego konto,
 * prowizję bramki rozlicza z P24, Rezio nie pobiera nic od rezerwacji.
 * Bez kompletu danych bramka działa w trybie symulacji (dev/demo).
 */
export default async function PaymentsConfigPage(props: {
  searchParams: Promise<{
    saved?: string;
    cleared?: string;
    error?: string;
    test?: string;
  }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;

  const configured = p24Configured(property);
  const hasAnyData =
    property.p24MerchantId !== "" ||
    property.p24ApiKey !== "" ||
    property.p24Crc !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-0.5 rounded-[9px] bg-slate-100 p-0.5">
          <Link
            href="/admin/platnosci"
            className="rounded-md px-3 py-1.5 text-[11.5px] font-bold text-slate-500 hover:text-slate-900"
          >
            Transakcje
          </Link>
          <Link
            href="/admin/faktury"
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-bold text-slate-500 hover:text-slate-900"
          >
            <FileText size={12} strokeWidth={2} /> Faktury
          </Link>
          <span className="rounded-md bg-white px-3 py-1.5 text-[11.5px] font-bold text-brand-900 shadow-sm">
            Konfiguracja
          </span>
        </div>
        {configured ? (
          property.p24Sandbox ? (
            <Badge tone="warning">Sandbox — środowisko testowe</Badge>
          ) : (
            <Badge tone="success">Produkcja — płatności aktywne</Badge>
          )
        ) : (
          <Badge tone="neutral">Tryb symulacji</Badge>
        )}
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">Zapisano konfigurację płatności.</p>}
      {sp.cleared && (
        <p className="alert-success">
          Dane Przelewy24 usunięte — bramka wróciła do trybu symulacji.
        </p>
      )}
      {sp.test === "ok" && (
        <p className="alert-success">
          Połączenie z Przelewy24 działa — dane dostępowe są poprawne.
        </p>
      )}
      {sp.test === "fail" && (
        <p className="alert-error">
          Przelewy24 odrzuciło dane dostępowe. Sprawdź POS ID i klucz API oraz
          czy przełącznik sandbox odpowiada środowisku, z którego pochodzą dane.
        </p>
      )}
      {sp.test === "missing" && (
        <p className="alert-warning">
          Uzupełnij i zapisz komplet danych, zanim przetestujesz połączenie.
        </p>
      )}

      <Card>
        <CardHeader
          title="Płatności online — Przelewy24"
          sub="Zaliczki BLIK, kartą i szybkim przelewem trafiają bezpośrednio na Twoje konto. Prowizję bramki (ok. 1%) rozliczasz z Przelewy24 — Rezio nie pobiera prowizji od rezerwacji."
        />
        <form action={updatePaymentSettings}>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                Merchant ID
                <input
                  name="p24MerchantId"
                  defaultValue={property.p24MerchantId}
                  placeholder="np. 123456"
                  autoComplete="off"
                  className="input tnum w-full"
                />
              </label>
              <label className="label">
                POS ID
                <input
                  name="p24PosId"
                  defaultValue={property.p24PosId}
                  placeholder="zwykle = Merchant ID"
                  autoComplete="off"
                  className="input tnum w-full"
                />
                <span className="text-[11px] font-normal text-slate-400">
                  puste pole = użyjemy Merchant ID
                </span>
              </label>
              <label className="label">
                <span className="flex items-center justify-between gap-2">
                  Klucz API
                  {property.p24ApiKey && (
                    <span className="tnum text-[10.5px] font-semibold text-slate-400">
                      {maskSecret(property.p24ApiKey)}
                    </span>
                  )}
                </span>
                <input
                  name="p24ApiKey"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    property.p24ApiKey ? "pozostaw puste, aby nie zmieniać" : ""
                  }
                  className="input tnum w-full"
                />
              </label>
              <label className="label">
                <span className="flex items-center justify-between gap-2">
                  Klucz CRC
                  {property.p24Crc && (
                    <span className="tnum text-[10.5px] font-semibold text-slate-400">
                      {maskSecret(property.p24Crc)}
                    </span>
                  )}
                </span>
                <input
                  name="p24Crc"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    property.p24Crc ? "pozostaw puste, aby nie zmieniać" : ""
                  }
                  className="input tnum w-full"
                />
              </label>
            </div>
            <label className="flex items-center gap-2.5 text-[12.5px] font-semibold text-slate-600">
              <input
                type="checkbox"
                name="p24Sandbox"
                defaultChecked={property.p24Sandbox}
                className="h-4 w-4 accent-brand-600"
              />
              Sandbox (środowisko testowe) — wyłącz po udanym teście, żeby
              przyjmować prawdziwe płatności
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">Zapisz konfigurację</Button>
            </div>
          </CardBody>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-[18px] py-3">
          <form action={testP24Connection}>
            <Button variant="quiet" size="sm" type="submit">
              <PlugZap size={13} strokeWidth={2} /> Testuj połączenie
            </Button>
          </form>
          {hasAnyData && (
            <form action={clearPaymentSettings}>
              <button className="text-xs font-semibold text-danger-600 hover:underline">
                Usuń dane i wróć do trybu symulacji
              </button>
            </form>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Jak włączyć płatności — 3 kroki"
          sub="konfiguracja zajmuje kilka minut, umowę z Przelewy24 podpisujesz online"
        />
        <CardBody>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              {
                t: "Umowa z Przelewy24",
                d: "Załóż konto firmowe na przelewy24.pl (rejestracja online, weryfikacja zwykle 1–2 dni robocze).",
              },
              {
                t: "Skopiuj dane",
                d: "Merchant ID, klucz API i klucz CRC znajdziesz w panelu P24: Moje dane → Konfiguracja API.",
              },
              {
                t: "Test i start",
                d: "Wklej dane powyżej, kliknij „Testuj połączenie”, a po udanym teście wyłącz sandbox.",
              },
            ].map((step, i) => (
              <li
                key={step.t}
                className="rounded-[11px] bg-slate-50 px-4 py-3.5"
              >
                <div className="text-[12px] font-bold text-brand-600">
                  {i + 1} · {step.t}
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
                  {step.d}
                </p>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Dopóki dane nie są uzupełnione, przycisk zaliczki działa w trybie
            symulacji (potwierdza rezerwację od razu, bez pobrania pieniędzy) —
            wygodne do testów, nie wystawiaj tak obiektu gościom. Procent
            zaliczki ustawisz w{" "}
            <Link
              href="/admin/obiekt"
              className="font-semibold text-brand-600 hover:underline"
            >
              ustawieniach obiektu
            </Link>
            .
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
