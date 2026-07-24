import Link from "next/link";
import {
  BedDouble,
  Building2,
  CreditCard,
  ExternalLink,
  FileText,
  HelpCircle,
  Image as ImageIcon,
  Plus,
  Share2,
  X,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  addPropertyFaq,
  deletePhoto,
  deletePropertyFaq,
  updateProperty,
  updatePropertyFaq,
  uploadPropertyPhoto,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SUGGESTED_FAQ } from "@/lib/faq";

export const dynamic = "force-dynamic";

const SUBNAV = [
  { href: "#dane", label: "Dane obiektu", icon: Building2 },
  { href: "#zdjecia", label: "Zdjęcia", icon: ImageIcon },
  { href: "#zasady", label: "Zasady pobytu", icon: FileText },
  { href: "#faq", label: "FAQ gości", icon: HelpCircle },
  { href: "#faktury", label: "Płatności i faktury", icon: CreditCard },
  { href: "/admin/pokoje", label: "Jednostki i cennik", icon: BedDouble },
  { href: "/admin/kanaly", label: "Kanały i iCal", icon: Share2 },
];

export default async function PropertySettingsPage() {
  const { property } = await requireOwner();
  const [photos, faqs] = await prisma.$transaction([
    prisma.photo.findMany({
      where: { propertyId: property.id },
      orderBy: { id: "asc" },
    }),
    prisma.propertyFaq.findMany({
      where: { propertyId: property.id },
      orderBy: [{ sort: "asc" }, { id: "asc" }],
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-[210px_1fr]">
        {/* Subnawigacja sekcji (11a) */}
        <nav className="top-[70px] flex gap-1 overflow-x-auto rounded-[14px] border border-slate-200 bg-white p-3 lg:sticky lg:flex-col">
          {SUBNAV.map(({ href, label, icon: Icon }, i) => {
            const external = !href.startsWith("#");
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-none items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] transition-colors ${
                  i === 0
                    ? "bg-brand-50 font-bold text-brand-900"
                    : "font-medium text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                {label}
                {external && (
                  <ExternalLink size={11} strokeWidth={2} className="ml-auto text-slate-400" />
                )}
              </Link>
            );
          })}
          <div className="mt-2 hidden border-t border-slate-100 px-2.5 pt-2.5 text-[11px] leading-relaxed text-slate-400 lg:block">
            Strona rezerwacji:{" "}
            <Link
              href={`/o/${property.slug}`}
              className="tnum font-semibold text-brand-600 hover:underline"
            >
              /o/{property.slug}
            </Link>
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          <form action={updateProperty} className="space-y-4">
            {/* Dane obiektu */}
            <Card>
              <div id="dane" />
              <CardHeader
                title="Dane obiektu"
                sub="Pojawiają się na stronie rezerwacji, potwierdzeniach i fakturach."
              />
              <CardBody className="space-y-4">
                <label className="label">
                  Nazwa obiektu *
                  <input name="name" required minLength={3} defaultValue={property.name} className="input" />
                </label>
                <label className="label">
                  Opis (widoczny na stronie obiektu)
                  <textarea name="description" rows={3} defaultValue={property.description} className="input" />
                </label>
                <label className="label">
                  Adres
                  <input name="address" defaultValue={property.address} className="input" />
                </label>
              </CardBody>
            </Card>

            {/* Zasady pobytu */}
            <Card>
              <div id="zasady" />
              <CardHeader
                title="Zasady pobytu"
                sub="Godziny doby hotelowej, zaliczka i instrukcje dla gości po meldunku."
              />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <label className="label">
                    Zameldowanie od
                    <input name="checkInFrom" defaultValue={property.checkInFrom} placeholder="15:00" className="input" />
                  </label>
                  <label className="label">
                    Wymeldowanie do
                    <input name="checkOutTo" defaultValue={property.checkOutTo} placeholder="11:00" className="input" />
                  </label>
                  <label className="label">
                    Zaliczka (%)
                    <input
                      type="number"
                      name="depositPercent"
                      min={0}
                      max={100}
                      defaultValue={property.depositPercent}
                      className="input"
                    />
                  </label>
                </div>
                <label className="label">
                  Instrukcje przyjazdu (kody drzwi, WiFi, dojazd) — gość zobaczy je dopiero po
                  wypełnieniu meldunku online
                  <textarea
                    name="arrivalInfo"
                    rows={4}
                    defaultValue={property.arrivalInfo}
                    placeholder={"Kod do drzwi: 1234#\nWiFi: NazwaSieci / hasło\nParking za budynkiem."}
                    className="input"
                  />
                </label>
              </CardBody>
            </Card>

            {/* Płatności i faktury */}
            <Card>
              <div id="faktury" />
              <CardHeader
                title="Dane do faktur"
                sub="Sprzedawca na fakturach. NIP jest wymagany, by wystawiać faktury. Puste pola = nazwa i adres obiektu."
              />
              <CardBody className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <label className="label">
                    Nazwa sprzedawcy (opcjonalnie)
                    <input name="sellerName" defaultValue={property.sellerName} placeholder={property.name} className="input" />
                  </label>
                  <label className="label">
                    NIP sprzedawcy
                    <input name="sellerNip" defaultValue={property.sellerNip} placeholder="np. 5220000000" className="input" />
                  </label>
                </div>
                <label className="label">
                  Adres na fakturze (opcjonalnie)
                  <input name="sellerAddress" defaultValue={property.sellerAddress} placeholder={property.address} className="input" />
                </label>
                <label className="label">
                  Numer konta bankowego (opcjonalnie)
                  <input
                    name="bankAccount"
                    defaultValue={property.bankAccount}
                    placeholder="PL00 0000 0000 0000 0000 0000 0000"
                    className="input tnum text-xs"
                  />
                </label>
              </CardBody>
            </Card>

            {/* Regulamin i RODO */}
            <Card>
              <div id="regulamin" />
              <CardHeader
                title="Regulamin i prywatność"
                sub={`Regulamin jest widoczny pod /o/${property.slug}/regulamin.`}
              />
              <CardBody className="space-y-4">
                <label className="label">
                  Regulamin obiektu
                  <textarea
                    name="terms"
                    rows={8}
                    defaultValue={property.terms}
                    placeholder={"§1. Doba hotelowa trwa od…\n§2. …"}
                    className="input font-mono text-xs"
                  />
                </label>
                <label className="label">
                  Polityka prywatności (RODO)
                  <textarea
                    name="privacyPolicy"
                    rows={8}
                    defaultValue={property.privacyPolicy}
                    placeholder="Administratorem danych osobowych jest…"
                    className="input font-mono text-xs"
                  />
                </label>
              </CardBody>
            </Card>

            <div className="sticky bottom-3 z-10">
              <div className="flex items-center gap-3 rounded-[14px] border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_4px_20px_-8px_rgba(18,56,41,0.25)] backdrop-blur">
                <Button type="submit">Zapisz zmiany</Button>
                <span className="text-xs text-slate-400">
                  Zapis obejmuje wszystkie sekcje powyżej.
                </span>
              </div>
            </div>
          </form>

          {/* Zdjęcia (osobne formy upload/delete) */}
          <Card>
            <div id="zdjecia" />
            <CardHeader
              title="Zdjęcia obiektu"
              sub="Pierwsze zdjęcie jest okładką w katalogu i tłem strony obiektu. JPG/PNG/WebP, maks. 8 MB."
            />
            <CardBody className="space-y-4">
              {photos.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {photos.map((p, i) => (
                    <div key={p.id} className="group relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.path}
                        alt=""
                        className="h-24 w-36 rounded-[11px] border border-slate-200 object-cover"
                      />
                      {i === 0 && (
                        <span className="absolute left-1.5 top-1.5 rounded-md bg-brand-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          okładka
                        </span>
                      )}
                      <form action={deletePhoto} className="absolute right-1.5 top-1.5">
                        <input type="hidden" name="id" value={p.id} />
                        <button
                          className="flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-danger-600 hover:bg-danger-100"
                          title="Usuń zdjęcie"
                        >
                          <X size={13} strokeWidth={2.4} />
                        </button>
                      </form>
                    </div>
                  ))}
                </div>
              )}
              <form action={uploadPropertyPhoto} className="flex items-center gap-3 text-sm">
                <input
                  type="file"
                  name="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="text-sm"
                />
                <Button variant="quiet" size="sm" type="submit">
                  <Plus size={13} strokeWidth={2.4} /> Dodaj zdjęcie
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* FAQ */}
          <Card>
            <div id="faq" />
            <CardHeader
              title="Najczęstsze pytania gości (FAQ)"
              sub="Wyświetlają się na stronie obiektu. Zacznij pisać pytanie, żeby zobaczyć podpowiedzi."
            />
            <CardBody className="space-y-4">
              {faqs.map((f) => (
                <div key={f.id} className="space-y-2 rounded-[11px] bg-slate-50 p-3">
                  <form action={updatePropertyFaq} className="space-y-2 text-sm">
                    <input type="hidden" name="id" value={f.id} />
                    <input
                      name="question"
                      defaultValue={f.question}
                      required
                      className="input w-full font-medium"
                    />
                    <textarea
                      name="answer"
                      defaultValue={f.answer}
                      rows={2}
                      required
                      className="input w-full"
                    />
                    <Button variant="quiet" size="sm" type="submit">
                      Zapisz zmiany
                    </Button>
                  </form>
                  <form action={deletePropertyFaq} className="-mt-8 text-right">
                    <input type="hidden" name="id" value={f.id} />
                    <button className="text-xs font-semibold text-danger-600 hover:underline">
                      Usuń
                    </button>
                  </form>
                </div>
              ))}
              {faqs.length === 0 && (
                <p className="text-sm text-slate-400">Brak pytań — dodaj pierwsze poniżej.</p>
              )}

              <form
                action={addPropertyFaq}
                className="space-y-2 border-t border-slate-100 pt-4 text-sm"
              >
                <label className="label">
                  Pytanie
                  <input
                    name="question"
                    required
                    list="faq-suggestions"
                    placeholder="np. Czy na miejscu jest parking?"
                    className="input w-full"
                  />
                </label>
                <datalist id="faq-suggestions">
                  {SUGGESTED_FAQ.map((q) => (
                    <option key={q} value={q} />
                  ))}
                </datalist>
                <label className="label">
                  Odpowiedź
                  <textarea
                    name="answer"
                    required
                    rows={2}
                    placeholder="np. Tak, bezpłatny parking na terenie obiektu."
                    className="input w-full"
                  />
                </label>
                <Button size="sm" type="submit">
                  <Plus size={13} strokeWidth={2.4} /> Dodaj pytanie
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
