import type { Metadata } from "next";
import { CalendarX, Plus, Search } from "lucide-react";
import Logo from "@/components/Logo";
import StatusBadge from "@/components/StatusBadge";
import Avatar from "@/components/ui/Avatar";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import KpiCard from "@/components/ui/KpiCard";
import ProgressBar from "@/components/ui/ProgressBar";
import Segmented from "@/components/ui/Segmented";
import Stepper from "@/components/ui/Stepper";
import Tabs from "@/components/ui/Tabs";
import Toggle from "@/components/ui/Toggle";

export const metadata: Metadata = {
  title: "Styleguide — design system 1c",
  robots: { index: false, follow: false },
};

const BRAND = [
  ["50", "#eef7f1"],
  ["100", "#e6f3ec"],
  ["200", "#cfe8da"],
  ["300", "#8fc7a9"],
  ["400 · mint", "#4ade9b"],
  ["500", "#2aa96b"],
  ["600 · primary", "#1f7a4d"],
  ["700", "#17603d"],
  ["800", "#144a30"],
  ["900 · rail", "#123829"],
  ["950 · hover", "#0d2b1e"],
] as const;

const NEUTRALS = [
  ["50 · tło aplikacji", "#f7faf8"],
  ["100", "#f2f6f4"],
  ["200 · obwódki", "#e6ede9"],
  ["300", "#d5ddd8"],
  ["400 · wygaszony", "#8ba498"],
  ["500 · podpisy", "#6b8377"],
  ["600 · treść", "#4d6459"],
  ["900 · tekst główny", "#132a20"],
] as const;

const STATUS = [
  ["Sukces / opłacona", "#1f7a4d", "#e6f3ec"],
  ["Ostrzeżenie / oczekuje", "#b5720e", "#faf1df"],
  ["Info / meldunek", "#5a8fb0", "#e9f1f7"],
  ["Błąd / anulowana", "#b0655a", "#f7ebe8"],
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-slate-200 pb-2 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ label, hex, text }: { label: string; hex: string; text?: string }) {
  return (
    <div className="min-w-0">
      <div
        className="h-14 rounded-[10px] border border-slate-200/60"
        style={{ background: hex, color: text }}
      />
      <div className="mt-1 truncate text-[11px] font-semibold">{label}</div>
      <div className="tnum text-[10.5px] text-slate-400">{hex}</div>
    </div>
  );
}

export default function StyleguidePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.17em] text-slate-500">
            Rezio · design system
          </p>
          <h1 className="mt-1 text-[28px] font-bold">
            Kierunek 1c „Zieleń wiodąca&rdquo;
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Żywe wytyczne UI: tokeny, logo i komponenty. Czysty, profesjonalny SaaS
            — ciemnozielony rail, wysoka gęstość danych, ikony line-art, bez emoji.
          </p>
        </div>
        <Badge tone="success">wdrożony kierunek</Badge>
      </header>

      <Section title="Logo — wariant D (R + odznaka potwierdzenia)">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-6">
            <Logo size={44} ringColor="#ffffff" />
            <p className="mt-3 text-[10.5px] text-slate-400">na jasnym tle</p>
          </Card>
          <div className="rounded-[14px] bg-brand-900 p-6">
            <Logo size={44} tone="dark" />
            <p className="mt-3 text-[10.5px] text-[#8fb5a2]">na ciemnym tle (rail, stopka)</p>
          </div>
          <Card className="flex items-center justify-between p-6">
            <span className="text-[10.5px] text-slate-400">favicon</span>
            <span className="flex items-center gap-3">
              <Logo size={36} wordmark={false} ringColor="#ffffff" />
              <Logo size={24} wordmark={false} ringColor="#ffffff" />
            </span>
          </Card>
        </div>
      </Section>

      <Section title="Kolory">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
          Zieleń marki (brand)
        </p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6 lg:grid-cols-11">
          {BRAND.map(([label, hex]) => (
            <Swatch key={hex} label={label} hex={hex} />
          ))}
        </div>
        <p className="pt-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
          Neutralne z zielonym podtonem (slate)
        </p>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {NEUTRALS.map(([label, hex]) => (
            <Swatch key={hex} label={label} hex={hex} />
          ))}
        </div>
        <p className="pt-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
          Statusy
        </p>
        <div className="grid gap-3 sm:grid-cols-4">
          {STATUS.map(([label, fg, bg]) => (
            <div
              key={label}
              className="rounded-[10px] px-3 py-2.5 text-[12.5px] font-bold"
              style={{ background: bg, color: fg }}
            >
              {label}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typografia">
        <Card className="divide-y divide-slate-100">
          <CardBody className="space-y-3">
            <p className="text-[10.5px] text-slate-400">
              Space Grotesk — nagłówki i UI · letter-spacing −0.02em
            </p>
            <p className="text-[28px] font-bold">H1 ekranu — 25–32px / 700</p>
            <p className="text-[15px] font-bold">Tytuł sekcji — 14.5–16px / 700</p>
            <p className="text-[13px] text-slate-600">
              Treść tabel i formularzy — 12.5–13.5px, kolor drugorzędny.
            </p>
            <p className="text-[11px] text-slate-400">Podpisy — 10.5–11.5px, wygaszone.</p>
            <p className="th">Nagłówek tabeli — 10.5px uppercase / .04em</p>
          </CardBody>
          <CardBody className="space-y-1.5">
            <p className="text-[10.5px] text-slate-400">
              JetBrains Mono — kody i kwoty · tabular-nums (klasa .tnum)
            </p>
            <p className="tnum text-[15px] font-semibold">HO-K2M4 · HO-3T8L</p>
            <p className="tnum text-[22px] font-bold">1 650 zł · 12 480 zł</p>
          </CardBody>
        </Card>
      </Section>

      <Section title="Przyciski">
        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>
                <Plus size={14} strokeWidth={2.4} /> Nowa rezerwacja
              </Button>
              <Button variant="accent">Rezerwuję</Button>
              <Button variant="quiet">Eksport CSV</Button>
              <Button variant="ghost">Anuluj</Button>
              <Button variant="danger">Anuluj rezerwację</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" variant="quiet">
                mały (sm)
              </Button>
              <Button size="md">średni (md)</Button>
              <Button size="lg" variant="accent">
                duży (lg)
              </Button>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Badge i statusy rezerwacji">
        <Card>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">Opłacona</Badge>
              <Badge tone="warning">Oczekuje / zaliczka</Badge>
              <Badge tone="info">W trakcie meldunku</Badge>
              <Badge tone="danger">Anulowana</Badge>
              <Badge tone="neutral">Zapytanie</Badge>
              <Badge tone="mint">▲ 18%</Badge>
              <Badge tone="dark">Plan Pro</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="CONFIRMED" />
              <StatusBadge status="PENDING" />
              <StatusBadge status="CANCELLED" />
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Formularze">
        <Card>
          <CardBody className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <label className="label">
                Imię i nazwisko gościa
                <input className="input" placeholder="np. Anna Kowalska" />
              </label>
              <label className="label">
                Jednostka
                <select className="input">
                  <option>Pokój Rodzinny</option>
                  <option>Domek Sauna</option>
                </select>
              </label>
              <div className="flex h-9 max-w-[300px] items-center gap-2 rounded-[10px] bg-slate-100 px-3 text-slate-400">
                <Search size={15} strokeWidth={2} />
                <span className="text-[12.5px]">Szukaj rezerwacji, gościa…</span>
              </div>
            </div>
            <div className="space-y-4">
              <Segmented
                name="sg-channel"
                defaultValue="direct"
                options={[
                  { value: "direct", label: "Bezpośrednia", hint: "0% prowizji" },
                  { value: "booking", label: "Booking" },
                  { value: "phone", label: "Telefon" },
                ]}
              />
              <div className="space-y-3">
                <Toggle
                  name="sg-t1"
                  defaultChecked
                  label="Wymagaj zaliczki"
                  hint="30% wartości pobytu przy rezerwacji"
                />
                <Toggle name="sg-t2" label="Meldunek online" hint="karta + e-podpis" />
              </div>
              <div className="space-y-2">
                <div className="alert-success">Zapisano zmiany.</div>
                <div className="alert-warning">Rezerwacja czeka na zaliczkę.</div>
                <div className="alert-error">Termin jest już zajęty.</div>
              </div>
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="KPI i karty">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            dark
            label="Przychód · lipiec 2026"
            value="12 480 zł"
            trend="▲ 18%"
            sub="vs czerwiec · 0 zł prowizji"
          />
          <KpiCard label="Przyjazdy dziś" value="4" sub="2 wyjazdy" />
          <KpiCard label="Obłożenie" value="82%" progress={82} />
          <KpiCard label="ADR" value="312 zł" sub="RevPAR 256 zł" />
        </div>
        <Card>
          <CardHeader
            title="Nagłówek karty"
            sub="podtytuł / kontekst"
            action={
              <Button size="sm" variant="quiet">
                akcja
              </Button>
            }
          />
          <CardBody className="text-[13px] text-slate-600">
            Treść karty — padding 18px, promień 14px, obwódka #e6ede9 i subtelny cień.
          </CardBody>
        </Card>
      </Section>

      <Section title="Tabela">
        <Card>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-slate-200 text-left">
                <th className="th px-[18px] py-2.5">Kod</th>
                <th className="th px-3 py-2.5">Gość</th>
                <th className="th px-3 py-2.5">Termin</th>
                <th className="th px-3 py-2.5 text-right">Kwota</th>
                <th className="th px-[18px] py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="text-slate-600">
              <tr className="border-b border-slate-100 transition-colors hover:bg-slate-50">
                <td className="tnum px-[18px] py-2.5 text-xs font-semibold text-slate-900">
                  HO-K2M4
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">Anna Kowalska</td>
                <td className="px-3 py-2.5">10–13 lip 2026</td>
                <td className="tnum px-3 py-2.5 text-right font-semibold text-slate-900">
                  1 650 zł
                </td>
                <td className="px-[18px] py-2.5">
                  <Badge tone="success">Opłacona</Badge>
                </td>
              </tr>
              <tr className="transition-colors hover:bg-slate-50">
                <td className="tnum px-[18px] py-2.5 text-xs font-semibold text-slate-900">
                  HO-3T8L
                </td>
                <td className="px-3 py-2.5 font-semibold text-slate-900">Krzysztof Nowak</td>
                <td className="px-3 py-2.5">10–15 lip 2026</td>
                <td className="tnum px-3 py-2.5 text-right font-semibold text-slate-900">
                  2 250 zł
                </td>
                <td className="px-[18px] py-2.5">
                  <Badge tone="warning">Zaliczka</Badge>
                </td>
              </tr>
            </tbody>
          </table>
        </Card>
      </Section>

      <Section title="Stepper, zakładki, postęp">
        <Card>
          <CardBody className="space-y-6">
            <Stepper
              steps={[
                { label: "Rezerwacja", state: "done" },
                { label: "Płatność", state: "done" },
                { label: "Meldunek", state: "active" },
                { label: "Przyjazd", state: "todo" },
                { label: "Wyjazd", state: "todo" },
              ]}
            />
            <Tabs
              items={[
                { href: "#", label: "Wszystkie", count: 18, active: true },
                { href: "#", label: "Opłacone", count: 9 },
                { href: "#", label: "Oczekujące", count: 4 },
                { href: "#", label: "Anulowane", count: 2 },
              ]}
            />
            <div className="max-w-sm space-y-2">
              <ProgressBar value={82} />
              <ProgressBar value={45} tone="mint" />
              <ProgressBar value={30} tone="warning" />
            </div>
          </CardBody>
        </Card>
      </Section>

      <Section title="Pusty stan i avatar">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <EmptyState
              icon={<CalendarX size={26} strokeWidth={2} />}
              title="Brak nadchodzących pobytów"
              description="Gdy pojawi się pierwsza rezerwacja, zobaczysz ją tutaj razem z planem dnia."
              action={<Button size="sm">Nowa rezerwacja</Button>}
            />
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4">
              <Avatar name="Katarzyna Malinowska" />
              <Avatar name="Jan Kowalski" tone="dark" size={36} />
              <Avatar name="Anna Nowak" tone="soft" size={44} />
              <p className="text-[11.5px] text-slate-400">
                mint / dark / soft — rail, listy gości, czat
              </p>
            </CardBody>
          </Card>
        </div>
      </Section>
    </div>
  );
}
