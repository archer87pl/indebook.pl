import Link from "next/link";
import { demoLogin, login } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-2xl font-bold text-center text-brand-950">Panel obiektu</h1>
      {sp.error && <p className="alert-error">Nieprawidłowy e-mail lub hasło.</p>}
      {sp.reset && (
        <p className="alert-success">✓ Hasło zmienione — zaloguj się nowym hasłem.</p>
      )}
      <form action={login} className="card p-6 space-y-4">
        <label className="label">
          E-mail
          <input type="email" name="email" required autoFocus className="input" />
        </label>
        <label className="label">
          Hasło
          <input type="password" name="password" required className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Zaloguj
        </button>
        <p className="text-xs text-slate-500 text-center">
          Nie masz konta?{" "}
          <Link href="/rejestracja" className="text-brand-700 font-semibold hover:underline">
            Zarejestruj obiekt
          </Link>
          {" · "}
          <Link href="/zapomniane-haslo" className="text-brand-700 font-semibold hover:underline">
            Nie pamiętam hasła
          </Link>
        </p>
      </form>
      <form action={demoLogin}>
        <button type="submit" className="btn-quiet w-full">
          👀 Zobacz demo panelu (bez rejestracji)
        </button>
      </form>
    </div>
  );
}
