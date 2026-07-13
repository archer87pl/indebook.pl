import Link from "next/link";
import { Check, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  addIcalFeed,
  deleteIcalFeed,
  syncAllIcalFeeds,
  syncOneIcalFeed,
} from "@/lib/actions";
import { requireOwner } from "@/lib/auth";
import { CHANNELS, channelDef } from "@/lib/channels";
import { formatRangeShortPl } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { findChannelConflicts } from "@/lib/ical";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Kolory kropek kanałów OTA wg 1c (bezpośrednia #1f7a4d, OTA jaśniejsze). */
const CHANNEL_DOT: Record<string, string> = {
  BOOKING: "#8fc7a9",
  AIRBNB: "#cfe8da",
  VRBO: "#c9992b",
  OTHER: "#d5ddd8",
};

export default async function ChannelsPage(props: {
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const { property } = await requireOwner();
  const sp = await props.searchParams;

  const units = await prisma.unit.findMany({
    where: { unitType: { propertyId: property.id } },
    include: {
      unitType: true,
      icalFeeds: { orderBy: { id: "asc" } },
    },
    orderBy: [{ unitTypeId: "asc" }, { id: "asc" }],
  });
  const conflicts = await findChannelConflicts(property.id);
  const feedCount = units.reduce((s, u) => s + u.icalFeeds.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-[13px] text-slate-500">
          Synchronizacja dostępności z Booking.com, Airbnb i innymi (iCal, w obie
          strony). Kalendarze odświeżają się automatycznie co godzinę.
        </p>
        {feedCount > 0 && (
          <form action={syncAllIcalFeeds}>
            <Button>
              <RefreshCw size={14} strokeWidth={2} /> Synchronizuj wszystko
            </Button>
          </form>
        )}
      </div>

      {sp.error && <p className="alert-error">{sp.error}</p>}
      {sp.synced && (
        <div className="alert-success flex items-center gap-2">
          <Check size={14} strokeWidth={2.4} className="flex-none" />
          <span>
            Synchronizacja zakończona — zaimportowane terminy: {sp.synced}.
          </span>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="space-y-3 rounded-[14px] border border-danger-600/30 bg-danger-100 p-[18px]">
          <h2 className="flex items-center gap-2 text-[15px] font-bold text-danger-600">
            <TriangleAlert size={16} strokeWidth={2} className="flex-none" />
            Możliwe podwójne rezerwacje ({conflicts.length})
          </h2>
          <p className="text-[13px] text-danger-600">
            Termin zajęty w zewnętrznym kanale nachodzi na aktywną rezerwację
            bezpośrednią tej samej jednostki. Skontaktuj się z gościem lub anuluj jedną
            z rezerwacji.
          </p>
          <div className="space-y-2 text-[13px]">
            {conflicts.map((c, i) => (
              <div
                key={i}
                className="flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-[10px] bg-white px-3 py-2 text-slate-600"
              >
                <span className="font-semibold text-slate-900">
                  {c.unitTypeName} ({c.unitName})
                </span>
                <span>
                  rezerwacja{" "}
                  <Link
                    href={`/admin/rezerwacje?status=`}
                    className="tnum text-[11px] font-semibold text-brand-600 hover:underline"
                  >
                    {c.reservation.code}
                  </Link>{" "}
                  {formatRangeShortPl(c.reservation.checkIn, c.reservation.checkOut)}
                </span>
                <span className="text-danger-600">
                  koliduje z „{c.block.feed?.name || c.block.note || "kanał"}”{" "}
                  {formatRangeShortPl(c.block.startDate, c.block.endDate)}
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
            <Card key={u.id}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {u.unitType.name} — {u.name}
                    {!u.active && (
                      <Badge tone="neutral">wyłączona ze sprzedaży</Badge>
                    )}
                  </span>
                }
              />
              <CardBody className="space-y-5">
                <div className="space-y-1.5">
                  <p className="th">Eksport (Rezio → kanał)</p>
                  <input
                    readOnly
                    value={exportUrl}
                    className="input tnum w-full bg-slate-50 text-xs text-slate-600"
                  />
                  <p className="text-[11px] text-slate-400">
                    Wklej ten adres w kanale jako „importowany kalendarz”. Zawiera
                    rezerwacje bezpośrednie i blokady ręczne (bez terminów z innych
                    kanałów — bez pętli).
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="th">Import (kanał → Rezio)</p>
                  {u.icalFeeds.map((f) => {
                    const ch = channelDef(f.channel);
                    return (
                      <div
                        key={f.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] bg-slate-50 px-3 py-2 text-[13px]"
                      >
                        <span className="min-w-0">
                          <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                            <span
                              aria-hidden
                              className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                              style={{
                                background:
                                  CHANNEL_DOT[f.channel] ?? CHANNEL_DOT.OTHER,
                              }}
                            />
                            {f.name || ch.label}
                          </span>{" "}
                          <span className="break-all text-[11px] text-slate-400">
                            {f.url}
                          </span>
                          <span className="mt-0.5 block text-[11px]">
                            {f.lastError ? (
                              <span className="font-semibold text-danger-600">
                                błąd: {f.lastError}
                              </span>
                            ) : f.lastSyncAt ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-brand-600">
                                <Check size={11} strokeWidth={2.4} />
                                zsynchronizowano{" "}
                                {f.lastSyncAt.toLocaleString("pl-PL", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                jeszcze nie synchronizowano
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="flex items-center gap-3">
                          <form action={syncOneIcalFeed}>
                            <input type="hidden" name="id" value={f.id} />
                            <button className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-700 hover:underline">
                              <RefreshCw size={13} strokeWidth={2} /> Sync
                            </button>
                          </form>
                          <form action={deleteIcalFeed}>
                            <input type="hidden" name="id" value={f.id} />
                            <button className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-danger-600 hover:underline">
                              <Trash2 size={13} strokeWidth={2} /> Usuń
                            </button>
                          </form>
                        </span>
                      </div>
                    );
                  })}
                  {u.icalFeeds.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      Brak podłączonych kanałów.
                    </p>
                  )}
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader
          title="Podłącz kanał"
          sub="import kalendarza iCal z zewnętrznego portalu"
        />
        <CardBody>
          <form
            action={addIcalFeed}
            className="flex flex-wrap items-end gap-3 text-sm"
          >
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
                    {c.label}
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
              <input
                name="name"
                placeholder="np. Booking pokój 12"
                className="input w-36"
              />
            </label>
            <Button>Dodaj i synchronizuj</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Jak połączyć kanał (w obie strony)" />
        <CardBody className="space-y-3">
          {CHANNELS.filter((c) => c.key !== "OTHER").map((c) => (
            <details key={c.key} className="text-[13px]">
              <summary className="cursor-pointer py-1 font-semibold text-slate-900">
                <span className="inline-flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CHANNEL_DOT[c.key] ?? CHANNEL_DOT.OTHER }}
                  />
                  {c.label}
                </span>
              </summary>
              <ol className="ml-5 mt-1 list-decimal space-y-1 text-slate-600">
                <li>
                  <span className="font-semibold">Import do Rezio:</span>{" "}
                  {c.importHint}
                </li>
                <li>
                  <span className="font-semibold">Eksport z Rezio:</span>{" "}
                  {c.exportHint}
                </li>
              </ol>
            </details>
          ))}
          <p className="text-[11px] text-slate-400">
            Synchronizacja iCal przenosi tylko dostępność (bez cen i danych gości) z
            opóźnieniem do 1 godziny. Pełna dwukierunkowa integracja API (ceny,
            rezerwacje w czasie rzeczywistym) wymaga certyfikacji partnerskiej — w
            planach.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
