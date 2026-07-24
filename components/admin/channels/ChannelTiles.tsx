// Kafle podłączania kanałów OTA (Channex): Booking.com (Hotel ID) i Airbnb (OAuth).
import Link from "next/link";
import { prisma } from "@/lib/db";
import SubmitButton from "@/components/ui/SubmitButton";
import { connectBookingChannel, refreshChannelStatus } from "@/lib/channex/channel-actions";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "Podłączony", cls: "bg-emerald-50 text-emerald-700" },
  PENDING: { label: "Oczekuje", cls: "bg-amber-50 text-amber-700" },
  ERROR: { label: "Błąd", cls: "bg-red-50 text-red-700" },
  NONE: { label: "Niepodłączony", cls: "bg-slate-100 text-slate-500" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_LABEL[status] ?? STATUS_LABEL.NONE;
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${s.cls}`}>{s.label}</span>;
}

export default async function ChannelTiles({ propertyId }: { propertyId: number }) {
  const channels = await prisma.channexChannel.findMany({ where: { propertyId } });
  const byType = new Map(channels.map((c) => [c.type, c]));
  const booking = byType.get("BOOKING");
  const airbnb = byType.get("AIRBNB");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Booking.com */}
      <div className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Booking.com</h3>
          <StatusPill status={booking?.status ?? "NONE"} />
        </div>
        {booking?.status === "CONNECTED" ? (
          <p className="text-[13px] text-slate-600">Kanał podłączony. Dostępność synchronizuje się automatycznie.</p>
        ) : (
          <form action={connectBookingChannel} className="space-y-2">
            <label className="label text-xs">
              Hotel ID z Booking.com
              <input name="hotelId" required placeholder="np. 1234567" className="input w-full" />
            </label>
            <p className="text-[11px] text-slate-400">
              Po podłączeniu zaakceptuj połączenie w extranecie Booking.com — to krok po stronie OTA.
            </p>
            <SubmitButton className="btn-primary text-[13px]">Podłącz</SubmitButton>
          </form>
        )}
        {booking?.lastError && <p className="text-[11px] text-red-600">{booking.lastError}</p>}
        {booking && (
          <form action={refreshChannelStatus}>
            <input type="hidden" name="type" value="BOOKING" />
            <SubmitButton className="text-xs font-semibold text-brand-600 hover:underline">
              Odśwież status
            </SubmitButton>
          </form>
        )}
      </div>

      {/* Airbnb */}
      <div className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold">Airbnb</h3>
          <StatusPill status={airbnb?.status ?? "NONE"} />
        </div>
        {airbnb?.status === "CONNECTED" ? (
          <p className="text-[13px] text-slate-600">Konto Airbnb połączone. Oferty zmapowane automatycznie.</p>
        ) : (
          <>
            <p className="text-[13px] text-slate-600">Połącz konto Airbnb jednym kliknięciem (autoryzacja OAuth).</p>
            <Link href="/api/channex/airbnb/start" className="btn-primary inline-flex text-[13px]">
              Podłącz Airbnb
            </Link>
          </>
        )}
        {airbnb?.lastError && <p className="text-[11px] text-red-600">{airbnb.lastError}</p>}
      </div>

      {/* Inne kanały */}
      <div className="card space-y-2 p-5 md:col-span-2">
        <h3 className="text-[15px] font-bold">Inne kanały (Expedia i in.)</h3>
        <p className="text-[13px] text-slate-600">
          Pozostałe kanały podłączysz w kreatorze Channex (fallback). Link pojawi się tu po pełnej
          konfiguracji integracji.
        </p>
      </div>
    </div>
  );
}
