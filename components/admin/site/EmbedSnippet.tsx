"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";

/**
 * Gotowy kod do wklejenia na WŁASNEJ stronie właściciela (WordPress, Wix,
 * Squarespace — wszędzie tam, gdzie da się wstawić HTML).
 *
 * Ramka, nie skrypt: nie wymaga zgody CORS, izoluje style (kalendarz nie
 * rozjedzie się od CSS-a cudzego szablonu) i nie zostawia nam wystawionego
 * pliku JS do wersjonowania w nieskończoność.
 */
export default function EmbedSnippet({
  unitTypes,
  baseUrl,
  published,
}: {
  unitTypes: { id: number; name: string }[];
  baseUrl: string;
  /** widget czyta dane tylko z OPUBLIKOWANEJ strony — bez niej nie zadziała */
  published: boolean;
}) {
  const [unitTypeId, setUnitTypeId] = useState(unitTypes[0]?.id);
  const [skopiowane, setSkopiowane] = useState(false);

  if (unitTypes.length === 0) {
    return (
      <Card>
        <CardHeader title="Widget na własną stronę" />
        <CardBody className="text-sm text-slate-600">
          Najpierw dodaj typ pokoju — widget pokazuje dostępność konkretnego pokoju.
        </CardBody>
      </Card>
    );
  }

  const kod = `<iframe src="${baseUrl}/embed/kalendarz/${unitTypeId}" width="100%" height="520" style="border:0" loading="lazy" title="Kalendarz dostępności"></iframe>`;

  const kopiuj = async () => {
    await navigator.clipboard.writeText(kod);
    setSkopiowane(true);
    setTimeout(() => setSkopiowane(false), 2000);
  };

  return (
    <Card>
      <CardHeader
        title="Widget na własną stronę"
        sub="Kalendarz dostępności do wklejenia poza RezFlow"
      />
      <CardBody className="space-y-3">
        {!published && (
          <p className="alert-warning">
            Widget zacznie działać po opublikowaniu strony — do tego czasu pokazuje
            komunikat o braku strony.
          </p>
        )}

        <label className="label">
          Pokój
          <select
            value={unitTypeId}
            onChange={(e) => setUnitTypeId(Number(e.target.value))}
            className="input w-full max-w-sm"
          >
            {unitTypes.map((ut) => (
              <option key={ut.id} value={ut.id}>
                {ut.name}
              </option>
            ))}
          </select>
        </label>

        <div>
          <textarea
            readOnly
            value={kod}
            rows={3}
            aria-label="Kod do wklejenia"
            className="input w-full font-mono text-[11.5px]"
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" onClick={kopiuj} className="btn-quiet mt-2 text-[13px]">
            {skopiowane ? (
              <>
                <Check size={14} strokeWidth={2.4} /> Skopiowano
              </>
            ) : (
              <>
                <Copy size={14} strokeWidth={2} /> Kopiuj kod
              </>
            )}
          </button>
        </div>

        <p className="text-[12px] text-slate-500">
          Gość wybiera termin w widgecie, a rezerwację kończy w RezFlow —
          przycisk otwiera się w nowej karcie. Językiem sterujesz parametrem{" "}
          <code className="rounded bg-slate-100 px-1">?lang=en</code> na końcu adresu.
        </p>
      </CardBody>
    </Card>
  );
}
