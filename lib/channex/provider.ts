// Abstrakcja channel managera (jak DomainProvider). Realny klient Channex
// dochodzi w Planie B; tu interfejs + stub do dev/testów. pushAri przyjmuje
// channexPropertyId, bo Channex wymaga property_id w payloadzie ARI.

export type AriDay = { date: string; availability: number; minStay: number };

export type ProvisionInput = {
  name: string;
  address: string;
  currency: string;
  timezone: string;
  checkInFrom: string;
  checkOutTo: string;
  rooms: { unitTypeId: number; title: string; occupancy: number; count: number }[];
};

export type ProvisionResult = {
  channexPropertyId: string;
  apiKey: string;
  rooms: { unitTypeId: number; roomTypeId: string; ratePlanId: string }[];
};

export type BookingData = {
  channexBookingId: string;
  channexPropertyId: string;
  channexRoomTypeId: string;
  channel: string;
  status: "new" | "modified" | "cancelled";
  revision: number;
  arrival: string;
  departure: string;
  guests: number;
  guestName: string;
  email: string;
  phone: string;
  totalGr: number;
  commissionGr: number;
};

export interface ChannelProvider {
  provisionProperty(input: ProvisionInput): Promise<ProvisionResult>;
  pushAri(
    apiKey: string,
    channexPropertyId: string,
    roomTypeId: string,
    ratePlanId: string,
    days: AriDay[]
  ): Promise<void>;
  getBooking(apiKey: string, bookingId: string): Promise<BookingData | null>;
}

type StubCall = {
  apiKey: string;
  channexPropertyId: string;
  roomTypeId: string;
  ratePlanId: string;
  days: AriDay[];
};

export const stubProvider: ChannelProvider & { calls: StubCall[] } = {
  calls: [],
  async provisionProperty(input) {
    return {
      channexPropertyId: "stub-prop",
      apiKey: "stub-key",
      rooms: input.rooms.map((r) => ({
        unitTypeId: r.unitTypeId,
        roomTypeId: `stub-rt-${r.unitTypeId}`,
        ratePlanId: `stub-rp-${r.unitTypeId}`,
      })),
    };
  },
  async pushAri(apiKey, channexPropertyId, roomTypeId, ratePlanId, days) {
    this.calls.push({ apiKey, channexPropertyId, roomTypeId, ratePlanId, days });
  },
  async getBooking() {
    return null;
  },
};

// Realny provider dochodzi w Planie B (gdy jest CHANNEX_API_KEY). Bez
// konfiguracji zwracamy null → tryb Channex ukryty w panelu. W dev/testach
// można wymusić stub przez CHANNEX_STUB=1.
export function channelProvider(): ChannelProvider | null {
  if (process.env.CHANNEX_STUB === "1") return stubProvider;
  return null;
}
