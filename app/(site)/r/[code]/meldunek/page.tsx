import Link from "next/link";
import { notFound } from "next/navigation";
import { PenLine } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { submitCheckIn } from "@/lib/actions";
import { canCheckIn, DOC_TYPES } from "@/lib/checkin";
import { formatDatePl, todayISO } from "@/lib/dates";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// Meldunek online: strona publiczna po kodzie rezerwacji. Po wypełnieniu NIE
// pokazujemy tu żadnych danych z karty — pełny wgląd ma tylko właściciel.
export default async function CheckInPage(props: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await props.params;
  const sp = await props.searchParams;
  const reservation = await prisma.reservation.findUnique({
    where: { code },
    include: {
      unit: { include: { unitType: { include: { property: true } } } },
    },
  });
  if (!reservation) notFound();

  const property = reservation.unit.unitType.property;
  const backLink = (
    <Link href={`/r/${code}`} className="text-sm font-semibold text-brand-600 hover:underline">
      ← Wróć do rezerwacji
    </Link>
  );

  if (reservation.checkInStatus === "COMPLETED") {
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">Meldunek online</h1>
        <p className="alert-success">
          Karta meldunkowa dla rezerwacji {code} została już wypełniona. Dziękujemy!
        </p>
        {backLink}
      </div>
    );
  }
  if (!canCheckIn(reservation)) {
    const past =
      reservation.status === "CONFIRMED" && reservation.checkOut < todayISO();
    return (
      <div className="mx-auto max-w-xl space-y-5 text-center">
        <h1 className="text-2xl font-bold">Meldunek online</h1>
        <p className="alert-warning">
          {past
            ? "Ten pobyt już się zakończył — meldunek online nie jest już dostępny."
            : reservation.status === "CANCELLED"
              ? "Ta rezerwacja została anulowana."
              : "Meldunek online będzie dostępny po potwierdzeniu rezerwacji (wpłacie zaliczki)."}
        </p>
        {backLink}
      </div>
    );
  }

  const extraGuests = Math.max(0, reservation.guests - 1);

  return (
    <div className="mx-auto max-w-xl space-y-5">
      {/* Nagłówek karty meldunkowej (8a) */}
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 flex-none items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
          <PenLine size={22} strokeWidth={2} />
        </div>
        <div>
          <h1 className="text-2xl font-bold leading-tight">Meldunek online</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className="tnum rounded-md bg-brand-100 px-2 py-0.5 text-[11.5px] text-brand-600">
              {code}
            </span>
            {property.name} · {formatDatePl(reservation.checkIn)} →{" "}
            {formatDatePl(reservation.checkOut)}
          </p>
        </div>
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}

      <p className="text-sm text-slate-600">
        Wypełnienie karty meldunkowej zajmie 2 minuty i przyspieszy zameldowanie na
        miejscu. Po wypełnieniu otrzymasz instrukcje przyjazdu.
      </p>

      <form action={submitCheckIn} className="space-y-4">
        <input type="hidden" name="code" value={code} />

        <Card>
          <CardHeader title="Dane gościa głównego" />
          <CardBody className="space-y-4">
            <label className="label">
              Imię i nazwisko *
              <input
                name="fullName"
                required
                minLength={3}
                defaultValue={reservation.guestName}
                className="input w-full"
              />
            </label>
            <label className="label">
              Adres zamieszkania *
              <input
                name="address"
                required
                minLength={5}
                placeholder="ulica, nr, kod pocztowy, miejscowość"
                className="input w-full"
              />
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="label">
                Obywatelstwo *
                <input
                  name="citizenship"
                  required
                  defaultValue="polskie"
                  className="input w-full"
                />
              </label>
              <label className="label">
                Planowana godzina przyjazdu
                <input type="time" name="arrivalTime" className="input w-full" />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <label className="label">
                Rodzaj dokumentu (opcjonalnie)
                <select name="docType" className="input w-full" defaultValue="">
                  <option value="">— nie podaję —</option>
                  {DOC_TYPES.map((d) => (
                    <option key={d.key} value={d.key}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="label">
                Numer dokumentu (opcjonalnie)
                <input name="docNumber" className="input w-full" />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Nie przesyłaj zdjęć ani skanów dokumentów — nie są potrzebne i ich nie
              przechowujemy.
            </p>
            <label className="label">
              Nr rejestracyjny samochodu (opcjonalnie)
              <input name="carPlate" placeholder="np. KR 12345" className="input tnum w-full" />
            </label>
          </CardBody>
        </Card>

        {extraGuests > 0 && (
          <Card>
            <CardHeader
              title={`Pozostali goście (${extraGuests})`}
              sub="Opcjonalnie — imię i nazwisko oraz data urodzenia (do celów statystycznych i opłaty miejscowej)."
            />
            <CardBody className="space-y-4">
              {Array.from({ length: extraGuests }, (_, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <label className="label">
                    Gość {i + 2} — imię i nazwisko
                    <input name={`guestName_${i + 1}`} className="input w-full" />
                  </label>
                  <label className="label">
                    Data urodzenia
                    <input type="date" name={`guestBirth_${i + 1}`} className="input w-full" />
                  </label>
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Podpis *" sub="Podpisz się palcem lub myszką." />
          <CardBody className="space-y-4">
            <SignaturePad />
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="terms" required className="mt-1 accent-brand-600" />
              <span>
                Akceptuję{" "}
                <Link
                  href={`/o/${property.slug}/regulamin`}
                  target="_blank"
                  className="font-semibold text-brand-600 underline"
                >
                  regulamin obiektu {property.name}
                </Link>{" "}
                *
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-600">
              <input type="checkbox" name="rodo" required className="mt-1 accent-brand-600" />
              <span>
                Wyrażam zgodę na przetwarzanie danych z karty meldunkowej przez{" "}
                {property.name} w celu realizacji pobytu. Dane są usuwane automatycznie
                12 miesięcy po wymeldowaniu. *
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full">
              Potwierdź i podpisz kartę meldunkową
            </Button>
          </CardBody>
        </Card>
      </form>
    </div>
  );
}
