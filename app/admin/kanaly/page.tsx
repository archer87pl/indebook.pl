import Link from "next/link";
import {
  addIcalFeed,
  deleteIcalFeed,
  syncAllIcalFeeds,
  syncOneIcalFeed,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { CHANNELS, channelDef } from "@/lib/channels";
import { formatDateShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { findChannelConflicts } from "@/lib/ical";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

export default async function ChannelsPage(props: {
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;

  const [units, conflicts] = await Promise.all([
    prisma.unit.findMany({
      where: { unitType: { propertyId: property.id } },
      include: {
        unitType: true,
        icalFeeds: { orderBy: { id: "asc" } },
      },
      orderBy: [{ unitTypeId: "asc" }, { id: "asc" }],
    }),
    findChannelConflicts(property.id),
  ]);
  const feedCount = units.reduce((s, u) => s + u.icalFeeds.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Kanały</h1>
          <p className="text-sm text-slate-500">
            Synchronizacja dostępności z Booking.com, Airbnb i innymi (iCal, w obie
            strony). Kalendarze odświeżają się automatycznie co godzinę.
          </p>
        </div>
        {feedCount > 0 && (
          <form action={syncAllIcalFeeds}>
            <button className="btn-primary text-sm">⟳ Synchronizuj wszystko</button>
          </form>
        )}
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.synced && (
        <p className="alert-success">
          ✓ Synchronizacja zakończona — zaimportowane terminy: {sp.synced}.
        </p>
      )}

      {conflicts.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-xl p-5 space-y-3">
          <h2 className="font-bold text-red-800">
            ⚠ Możliwe podwójne rezerwacje ({conflicts.length})
          </h2>
          <p className="text-sm text-red-700">
            Termin zajęty w zewnętrznym kanale nachodzi na aktywną rezerwację
            bezpośrednią tej samej jednostki. Skontaktuj się z gościem lub anuluj jedną
            z rezerwacji.
          </p>
          <div className="space-y-2 text-sm">
            {conflicts.map((c, i) => (
              <div key={i} className="bg-white rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-1">
                <span className="font-semibold">
                  {c.unitTypeName} ({c.unitName})
                </span>
                <span>
                  rezerwacja{" "}
                  <Link
                    href={`/admin/rezerwacje?status=`}
                    className="font-mono text-brand-700 hover:underline"
                  >
                    {c.reservation.code}
                  </Link>{" "}
                  {formatDateShortPl(c.reservation.checkIn)} →{" "}
                  {formatDateShortPl(c.reservation.checkOut)}
                </span>
                <span className="text-red-700">
                  koliduje z „{c.block.feed?.name || c.block.note || "kanał"}”{" "}
                  {formatDateShortPl(c.block.startDate)} →{" "}
                  {formatDateShortPl(c.block.endDate)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {units.map((u) => {
          const exportUrl = `${appUrl()}/api/ical/${u.id}?t=${u.icalToken}`;
          return (
            <div key={u.id} className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-bold text-brand-950">
                  {u.unitType.name} — {u.name}
                  {!u.active && (
                    <span className="ml-2 text-xs font-normal text-slate-400">
                      (wyłączona ze sprzedaży)
                    </span>
                  )}
                </h2>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Eksport (Rezio → kanał)
                </p>
                <input
                  readOnly
                  value={exportUrl}
                  className="input w-full font-mono text-xs text-slate-600 bg-slate-50"
                />
                <p className="text-xs text-slate-400">
                  Wklej ten adres w kanale jako „importowany kalendarz”. Zawiera
                  rezerwacje bezpośrednie i blokady ręczne (bez terminów z innych
                  kanałów — bez pętli).
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Import (kanał → Rezio)
                </p>
                {u.icalFeeds.map((f) => {
                  const ch = channelDef(f.channel);
                  return (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="font-medium">
                          {ch.emoji} {f.name || ch.label}
                        </span>{" "}
                        <span className="text-slate-400 break-all text-xs">{f.url}</span>
                        <span className="block text-xs mt-0.5">
                          {f.lastError ? (
                            <span className="text-red-600">błąd: {f.lastError}</span>
                          ) : f.lastSyncAt ? (
                            <span className="text-emerald-700">
                              ✓ zsynchronizowano{" "}
                              {f.lastSyncAt.toLocaleString("pl-PL", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-400">jeszcze nie synchronizowano</span>
                          )}
                        </span>
                      </span>
                      <span className="flex gap-3 items-center">
                        <form action={syncOneIcalFeed}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="text-brand-700 hover:underline">⟳ Sync</button>
                        </form>
                        <form action={deleteIcalFeed}>
                          <input type="hidden" name="id" value={f.id} />
                          <button className="text-red-600 hover:underline">Usuń</button>
                        </form>
                      </span>
                    </div>
                  );
                })}
                {u.icalFeeds.length === 0 && (
                  <p className="text-xs text-slate-400">Brak podłączonych kanałów.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg text-brand-950">+ Podłącz kanał</h2>
        <form action={addIcalFeed} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="label">
            Jednostka
            <select name="unitId" required className="input">
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitType.name} — {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="label">
            Kanał
            <select name="channel" required className="input">
              {CHANNELS.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.emoji} {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="label flex-1 min-w-64">
            Adres URL kalendarza (.ics)
            <input
              name="url"
              required
              placeholder="https://admin.booking.com/…/export.ics"
              className="input w-full"
            />
          </label>
          <label className="label">
            Nazwa (opcjonalnie)
            <input name="name" placeholder="np. Booking pokój 12" className="input w-36" />
          </label>
          <button className="btn-primary py-2">Dodaj i synchronizuj</button>
        </form>
      </div>

      <div className="card p-6 space-y-3">
        <h2 className="font-semibold text-brand-950">Jak połączyć kanał (w obie strony)</h2>
        {CHANNELS.filter((c) => c.key !== "OTHER").map((c) => (
          <details key={c.key} className="text-sm">
            <summary className="cursor-pointer font-medium py-1">
              {c.emoji} {c.label}
            </summary>
            <ol className="list-decimal ml-5 mt-1 space-y-1 text-slate-600">
              <li>
                <span className="font-medium">Import do Rezio:</span> {c.importHint}
              </li>
              <li>
                <span className="font-medium">Eksport z Rezio:</span> {c.exportHint}
              </li>
            </ol>
          </details>
        ))}
        <p className="text-xs text-slate-400">
          Synchronizacja iCal przenosi tylko dostępność (bez cen i danych gości) z
          opóźnieniem do 1 godziny. Pełna dwukierunkowa integracja API (ceny,
          rezerwacje w czasie rzeczywistym) wymaga certyfikacji partnerskiej — w
          planach.
        </p>
      </div>
    </div>
  );
}
