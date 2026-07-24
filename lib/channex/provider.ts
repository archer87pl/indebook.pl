// Abstrakcja channel managera (jak DomainProvider): interfejs + stub do
// dev/testów + realny klient Channex wybierany po env. pushAri przyjmuje
// channexPropertyId, bo Channex wymaga property_id w payloadzie ARI.
import { ChannexClient } from "./client";

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
  registerWebhook(channexPropertyId: string, callbackUrl: string, secret: string): Promise<void>;
  connectBooking(
    channexPropertyId: string,
    hotelId: string,
    mapping: { roomTypeId: string; ratePlanId: string }[]
  ): Promise<{ channelId: string; status: string }>;
  startAirbnbOAuth(channexPropertyId: string, redirectUrl: string): Promise<{ authUrl: string }>;
  finishAirbnbOAuth(channexPropertyId: string, code: string): Promise<{ channelId: string; status: string }>;
  channelStatus(channelId: string): Promise<{ status: string; message: string }>;
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
  async registerWebhook() {
    // no-op w stubie
  },
  async connectBooking() {
    return { channelId: "stub-booking", status: "connected" };
  },
  async startAirbnbOAuth() {
    return { authUrl: "/api/channex/airbnb/callback?code=stub&state=STATE" };
  },
  async finishAirbnbOAuth() {
    return { channelId: "stub-airbnb", status: "connected" };
  },
  async channelStatus() {
    return { status: "connected", message: "" };
  },
};

// Wybór providera: CHANNEX_STUB=1 → stub (dev/testy); w przeciwnym razie realny
// klient Channex, gdy jest CHANNEX_API_KEY; inaczej null → tryb Channex ukryty
// w panelu (wzorzec jak P24/Vercel). Konfiguracja z env (bez rippla async).
export function channelProvider(): ChannelProvider | null {
  if (process.env.CHANNEX_STUB === "1") return stubProvider;
  const apiKey = process.env.CHANNEX_API_KEY;
  if (!apiKey) return null;
  const baseUrl = process.env.CHANNEX_BASE_URL || "https://staging.channex.io/api/v1";
  return new ChannexClient(apiKey, baseUrl);
}
