import Link from "next/link";
import { requestPasswordReset } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ sent?: string; expired?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-2xl font-bold text-center text-brand-950">Reset hasła</h1>
      {sp.sent && (
        <p className="alert-success">
          Jeśli konto istnieje, wysłaliśmy link do resetu hasła (ważny 1 godzinę).
        </p>
      )}
      {sp.expired && (
        <p className="alert-error">Link wygasł lub jest nieprawidłowy — poproś o nowy.</p>
      )}
      <form action={requestPasswordReset} className="card p-6 space-y-4">
        <label className="label">
          E-mail konta
          <input type="email" name="email" required autoFocus className="input" />
        </label>
        <button type="submit" className="btn-primary w-full">
          Wyślij link do resetu
        </button>
        <p className="text-xs text-slate-500 text-center">
          <Link href="/login" className="text-brand-700 font-semibold hover:underline">
            ← Wróć do logowania
          </Link>
        </p>
      </form>
    </div>
  );
}
