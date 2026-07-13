import Link from "next/link";
import Button from "@/components/ui/Button";
import { requestPasswordReset } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage(props: {
  searchParams: Promise<{ sent?: string; expired?: string }>;
}) {
  const sp = await props.searchParams;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold">Reset hasła</h1>
        <p className="mt-1 text-[13px] text-slate-400">
          Wyślemy Ci link do ustawienia nowego hasła.
        </p>
      </div>
      {sp.sent && (
        <p className="alert-success">
          Jeśli konto istnieje, wysłaliśmy link do resetu hasła (ważny 1 godzinę).
        </p>
      )}
      {sp.expired && (
        <p className="alert-error">Link wygasł lub jest nieprawidłowy — poproś o nowy.</p>
      )}
      <form action={requestPasswordReset} className="space-y-4">
        <label className="label">
          E-mail konta
          <input type="email" name="email" required autoFocus className="input h-[46px]" />
        </label>
        <Button type="submit" size="lg" className="w-full">
          Wyślij link do resetu
        </Button>
        <p className="text-center text-[12.5px] text-slate-400">
          <Link href="/login" className="font-bold text-brand-600 hover:underline">
            ← Wróć do logowania
          </Link>
        </p>
      </form>
    </div>
  );
}
