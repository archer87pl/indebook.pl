import { Send } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { superClearSettings, superSaveSettings, superSendTestMail } from "@/lib/actions";
import { requireSuperadmin } from "@/lib/auth";
import {
  SETTING_SECTIONS,
  getDbSettings,
  maskSecret,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Konfiguracja bramek/integracji platformy (Przelewy24, Resend, SMSAPI).
 * Wartości zapisane tutaj mają pierwszeństwo nad zmiennymi środowiskowymi;
 * ENV pozostaje fallbackiem. Sekrety pokazujemy tylko jako maskę końcówki.
 */
export default async function SuperadminSettingsPage(props: {
  searchParams: Promise<{ saved?: string; cleared?: string; testmail?: string }>;
}) {
  await requireSuperadmin();
  const sp = await props.searchParams;
  const db = await getDbSettings();

  const effective = (key: string) => db[key] ?? process.env[key] ?? "";
  const source = (key: string): "panel" | "env" | null =>
    db[key] !== undefined && db[key] !== ""
      ? "panel"
      : process.env[key]
        ? "env"
        : null;

  return (
    <div className="space-y-4">
      {sp.testmail && (
        <p className="alert-success">
          Testowy e-mail wysłany na adres administratora — sprawdź skrzynkę (bez
          klucza API wiadomość trafia do logu konsoli serwera).
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {SETTING_SECTIONS.map((section) => {
          const configured = section.requiredKeys.every((k) => effective(k) !== "");
          const fromPanel = section.fields.some((f) => source(f.key) === "panel");
          return (
            <Card key={section.id} className={section.id === "p24" ? "xl:col-span-2" : ""}>
              <CardHeader
                title={section.title}
                sub={section.description}
                action={
                  configured ? (
                    <Badge tone="success">
                      skonfigurowana{fromPanel ? " · panel" : " · ENV"}
                    </Badge>
                  ) : (
                    <Badge tone="warning">nieskonfigurowana</Badge>
                  )
                }
              />
              <form action={superSaveSettings}>
                <CardBody className="space-y-4">
                  <input type="hidden" name="section" value={section.id} />
                  <div
                    className={`grid gap-4 ${section.id === "p24" ? "sm:grid-cols-2" : ""}`}
                  >
                    {section.fields.map((field) => {
                      const current = effective(field.key);
                      const src = source(field.key);
                      return (
                        <label key={field.key} className="label">
                          <span className="flex items-center justify-between gap-2">
                            {field.label}
                            {src && (
                              <span className="tnum text-[10.5px] font-semibold text-slate-400">
                                {field.secret
                                  ? maskSecret(current)
                                  : current.length > 28
                                    ? `${current.slice(0, 28)}…`
                                    : current}
                                {" · "}
                                {src === "panel" ? "panel" : "ENV"}
                              </span>
                            )}
                          </span>
                          <input
                            name={field.key}
                            type={field.secret ? "password" : "text"}
                            autoComplete="off"
                            placeholder={
                              current
                                ? "pozostaw puste, aby nie zmieniać"
                                : (field.placeholder ?? "")
                            }
                            className="input tnum w-full"
                          />
                          {field.hint && (
                            <span className="text-[11px] font-normal text-slate-400">
                              {field.hint}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button type="submit">Zapisz {section.title.split(" — ")[0].toLowerCase()}</Button>
                    {sp.saved === section.id && (
                      <span className="text-xs font-semibold text-brand-600">
                        Zapisano.
                      </span>
                    )}
                    {sp.cleared === section.id && (
                      <span className="text-xs font-semibold text-accent-500">
                        Wyczyszczono — obowiązują wartości z ENV.
                      </span>
                    )}
                  </div>
                </CardBody>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-[18px] py-3">
                {fromPanel ? (
                  <form action={superClearSettings}>
                    <input type="hidden" name="section" value={section.id} />
                    <button className="text-xs font-semibold text-danger-600 hover:underline">
                      Usuń nadpisania panelu (wróć do ENV)
                    </button>
                  </form>
                ) : (
                  <span className="text-[11px] text-slate-400">
                    Brak nadpisań z panelu — obowiązują zmienne środowiskowe.
                  </span>
                )}
                {section.id === "mail" && (
                  <form action={superSendTestMail}>
                    <Button variant="quiet" size="sm" type="submit">
                      <Send size={13} strokeWidth={2} /> Wyślij testowy e-mail
                    </Button>
                  </form>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed text-slate-400">
        Wartości zapisane w panelu są trzymane w bazie (tabela PlatformSetting)
        i mają pierwszeństwo nad zmiennymi środowiskowymi o tych samych nazwach.
        Sekrety nie są nigdzie wyświetlane w całości — puste pole przy zapisie
        oznacza „bez zmian”. Zmiany konfiguracji są odnotowywane w{" "}
        <a href="/superadmin/logi" className="font-semibold text-brand-600 hover:underline">
          dzienniku zdarzeń
        </a>
        .
      </p>
    </div>
  );
}
