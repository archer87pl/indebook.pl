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

export default async function PropertySettingsPage(props: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;
  const [photos, faqs] = await Promise.all([
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
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Obiekt</h1>
      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.saved && <p className="alert-success">✓ Zapisano zmiany.</p>}

      <div className="card p-6 space-y-1 text-sm">
        <p className="text-slate-500">Adres strony rezerwacji:</p>
        <p className="font-mono text-brand-700">/o/{property.slug}</p>
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-semibold">Zdjęcia obiektu</h2>
        <p className="text-xs text-slate-500">
          Pierwsze zdjęcie jest okładką w katalogu i tłem strony obiektu. JPG/PNG/WebP,
          maks. 8 MB.
        </p>
        {photos.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <div key={p.id} className="relative group">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.path}
                  alt=""
                  className="h-24 w-36 object-cover rounded-lg border border-slate-200"
                />
                {i === 0 && (
                  <span className="absolute top-1 left-1 bg-brand-700 text-white text-[10px] font-semibold rounded px-1.5 py-0.5">
                    okładka
                  </span>
                )}
                <form action={deletePhoto} className="absolute top-1 right-1">
                  <input type="hidden" name="id" value={p.id} />
                  <button
                    className="bg-white/90 hover:bg-red-50 text-red-600 rounded px-1.5 text-xs font-bold"
                    title="Usuń zdjęcie"
                  >
                    ✕
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
          <button className="btn-quiet py-1.5">Dodaj zdjęcie</button>
        </form>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Najczęstsze pytania gości (FAQ)</h2>
          <p className="text-xs text-slate-500">
            Wyświetlają się na stronie obiektu — jak sekcja pytań na Booking.com.
            Zacznij pisać pytanie, żeby zobaczyć podpowiedzi typowych pytań.
          </p>
        </div>

        {faqs.map((f) => (
          <div key={f.id} className="bg-slate-50 rounded-lg p-3 space-y-2">
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
              <div className="flex items-center gap-3">
                <button className="btn-quiet py-1 text-xs">Zapisz zmiany</button>
              </div>
            </form>
            <form action={deletePropertyFaq} className="text-right -mt-8">
              <input type="hidden" name="id" value={f.id} />
              <button className="text-xs text-red-500 hover:underline">Usuń</button>
            </form>
          </div>
        ))}
        {faqs.length === 0 && (
          <p className="text-sm text-slate-400">
            Brak pytań — dodaj pierwsze poniżej.
          </p>
        )}

        <form action={addPropertyFaq} className="space-y-2 text-sm border-t border-slate-100 pt-4">
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
          <button className="btn-primary py-2">+ Dodaj pytanie</button>
        </form>
      </div>

      <form action={updateProperty} className="card p-6 space-y-4">
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
          Regulamin obiektu (widoczny pod /o/{property.slug}/regulamin)
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
        <button type="submit" className="btn-primary">
          Zapisz
        </button>
      </form>
    </div>
  );
}
