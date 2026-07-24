// Mapowanie payloadu rezerwacji Channex (data.attributes) na BookingData.
import type { BookingData } from "./provider";

export function otaNameToSource(otaName: string): string {
  const n = (otaName || "").toLowerCase();
  if (n.includes("booking")) return "BOOKING";
  if (n.includes("airbnb")) return "AIRBNB";
  if (n.includes("expedia")) return "EXPEDIA";
  return "CHANNEX_OTHER";
}

type Attrs = {
  id?: unknown;
  property_id?: unknown;
  status?: unknown;
  revision_id?: unknown;
  ota_name?: unknown;
  arrival_date?: unknown;
  departure_date?: unknown;
  amount?: unknown;
  customer?: { name?: unknown; surname?: unknown; mail?: unknown; phone?: unknown };
  rooms?: { room_type_id?: unknown; occupancy?: { adults?: unknown; children?: unknown } }[];
};

export function mapChannexBooking(a: Attrs): BookingData {
  const room = a.rooms?.[0] ?? {};
  const occ = room.occupancy ?? {};
  const guests = Number(occ.adults ?? 0) + Number(occ.children ?? 0);
  const name = [a.customer?.name, a.customer?.surname].filter(Boolean).join(" ").trim();
  const revNum = Number(String(a.revision_id ?? "").replace(/\D/g, "").slice(0, 12)) || 0;
  const status = a.status === "cancelled" ? "cancelled" : a.status === "modified" ? "modified" : "new";
  return {
    channexBookingId: String(a.id ?? ""),
    channexPropertyId: String(a.property_id ?? ""),
    channexRoomTypeId: String(room.room_type_id ?? ""),
    channel: otaNameToSource(String(a.ota_name ?? "")),
    status,
    revision: revNum,
    arrival: String(a.arrival_date ?? ""),
    departure: String(a.departure_date ?? ""),
    guests: Math.max(1, guests),
    guestName: name || "Gość OTA",
    email: String(a.customer?.mail ?? ""),
    phone: String(a.customer?.phone ?? ""),
    totalGr: Math.round(parseFloat(String(a.amount ?? "0")) * 100),
    commissionGr: 0,
  };
}
