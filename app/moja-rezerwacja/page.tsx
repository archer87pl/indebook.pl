import { findReservation } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function MyReservationPage(props: {
  searchParams: Promise<{ error?: string; code?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="max-w-sm mx-auto mt-12 space-y-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-brand-950">Moja rezerwacja</h1>
        <p className="text-sm text-slate-500">
          Podaj kod rezerwacji (z e-maila) i adres, na który została złożona.
        </p>
      </div>
      {sp.error && (
        <p className="alert-error">
          Nie znaleźliśmy rezerwacji o tym kodzie i adresie e-mail.
        </p>
      )}
      <form action={findReservation} className="card p-6 space-y-4">
        <label className="label">
          Kod rezerwacji
          <input
            name="code"
            required
            placeholder="HO-XXXXXX"
            defaultValue={sp.code ?? ""}
            className="input font-mono uppercase"
          />
        </label>
        <label className="label">
          E-mail
          <input type="email" name="email" required className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Pokaż rezerwację
        </button>
      </form>
    </div>
  );
}
