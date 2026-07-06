import Link from "next/link";
import { register } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function RegisterPage(props: {
  searchParams: Promise<{
    error?: string;
    name?: string;
    email?: string;
    propertyName?: string;
  }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="max-w-md mx-auto mt-10 space-y-4">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-brand-950">Zarejestruj swój obiekt</h1>
        <p className="text-sm text-slate-500">
          Konto właściciela + strona obiektu z rezerwacją online. Bez prowizji.
        </p>
      </div>
      {sp.error && <p className="alert-error">{sp.error}</p>}
      <form action={register} className="card p-6 space-y-4">
        <label className="label">
          Imię i nazwisko *
          <input name="name" required minLength={3} defaultValue={sp.name ?? ""} className="input" />
        </label>
        <label className="label">
          E-mail *
          <input type="email" name="email" required defaultValue={sp.email ?? ""} className="input" />
        </label>
        <label className="label">
          Hasło * (min. 8 znaków)
          <input type="password" name="password" required minLength={8} className="input" />
        </label>
        <hr className="border-slate-200" />
        <label className="label">
          Nazwa obiektu *
          <input
            name="propertyName"
            required
            minLength={3}
            placeholder="np. Willa Pod Sosnami"
            defaultValue={sp.propertyName ?? ""}
            className="input"
          />
        </label>
        <button type="submit" className="btn-primary w-full py-3">
          Załóż konto i obiekt
        </button>
        <p className="text-xs text-slate-500 text-center">
          Masz już konto?{" "}
          <Link href="/login" className="text-brand-700 font-semibold hover:underline">
            Zaloguj się
          </Link>
        </p>
      </form>
    </div>
  );
}
