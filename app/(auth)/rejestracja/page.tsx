import Link from "next/link";
import Button from "@/components/ui/Button";
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
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold">Zarejestruj swój obiekt</h1>
        <p className="mt-1 text-[13px] text-slate-400">
          Konto właściciela + strona obiektu z rezerwacją online. Bez prowizji.
        </p>
      </div>
      {sp.error && <p className="alert-error">{sp.error}</p>}
      <form action={register} className="space-y-4">
        <label className="label">
          Imię i nazwisko *
          <input name="name" required minLength={3} defaultValue={sp.name ?? ""} className="input h-[46px]" />
        </label>
        <label className="label">
          E-mail *
          <input type="email" name="email" required defaultValue={sp.email ?? ""} className="input h-[46px]" />
        </label>
        <label className="label">
          Hasło * (min. 8 znaków)
          <input type="password" name="password" required minLength={8} className="input h-[46px]" />
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
            className="input h-[46px]"
          />
        </label>
        <Button type="submit" size="lg" className="w-full">
          Załóż konto i obiekt
        </Button>
        <p className="text-center text-[12.5px] text-slate-400">
          Masz już konto?{" "}
          <Link href="/login" className="font-bold text-brand-600 hover:underline">
            Zaloguj się
          </Link>
        </p>
      </form>
    </div>
  );
}
