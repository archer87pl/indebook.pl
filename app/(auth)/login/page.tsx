import Link from "next/link";
import { Eye } from "lucide-react";
import Button from "@/components/ui/Button";
import { demoLogin, login } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage(props: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold">Zaloguj się</h1>
        <p className="mt-1 text-[13px] text-slate-400">Wejdź do panelu obiektu</p>
      </div>
      {sp.error && <p className="alert-error">Nieprawidłowy e-mail lub hasło.</p>}
      {sp.reset && (
        <p className="alert-success">Hasło zmienione — zaloguj się nowym hasłem.</p>
      )}
      <form action={login} className="space-y-4">
        <label className="label">
          E-mail
          <input type="email" name="email" required autoFocus className="input h-[46px]" />
        </label>
        <label className="label">
          <span className="flex items-center justify-between">
            Hasło
            <Link
              href="/zapomniane-haslo"
              className="text-[11.5px] font-semibold text-brand-600 hover:underline"
            >
              Nie pamiętasz?
            </Link>
          </span>
          <input type="password" name="password" required className="input h-[46px]" />
        </label>
        <Button type="submit" size="lg" className="w-full">
          Zaloguj się
        </Button>
      </form>
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[11px] text-slate-400">lub</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <form action={demoLogin}>
        <Button variant="quiet" size="lg" type="submit" className="w-full">
          <Eye size={15} strokeWidth={2} /> Zobacz demo panelu (bez rejestracji)
        </Button>
      </form>
      <p className="pt-2 text-center text-[12.5px] text-slate-400">
        Nie masz konta?{" "}
        <Link href="/rejestracja" className="font-bold text-brand-600 hover:underline">
          Zarejestruj obiekt
        </Link>
      </p>
    </div>
  );
}
