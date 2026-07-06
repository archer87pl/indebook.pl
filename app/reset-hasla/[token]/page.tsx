import { resetPassword } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  return (
    <div className="max-w-sm mx-auto mt-16 space-y-4">
      <h1 className="text-2xl font-bold text-center text-brand-950">Nowe hasło</h1>
      {sp.error && <p className="alert-error">{sp.error}</p>}
      <form action={resetPassword} className="card p-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="label">
          Nowe hasło (min. 8 znaków)
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoFocus
            className="input"
          />
        </label>
        <button type="submit" className="btn-primary w-full">
          Ustaw hasło i wyloguj wszystkie sesje
        </button>
      </form>
    </div>
  );
}
