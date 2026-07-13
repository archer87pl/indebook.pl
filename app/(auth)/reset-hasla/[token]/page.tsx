import Button from "@/components/ui/Button";
import { resetPassword } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage(props: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await props.params;
  const sp = await props.searchParams;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold">Nowe hasło</h1>
        <p className="mt-1 text-[13px] text-slate-400">
          Ustaw nowe hasło do panelu obiektu.
        </p>
      </div>
      {sp.error && <p className="alert-error">{sp.error}</p>}
      <form action={resetPassword} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <label className="label">
          Nowe hasło (min. 8 znaków)
          <input
            type="password"
            name="password"
            required
            minLength={8}
            autoFocus
            className="input h-[46px]"
          />
        </label>
        <Button type="submit" size="lg" className="w-full">
          Ustaw hasło i wyloguj wszystkie sesje
        </Button>
      </form>
    </div>
  );
}
