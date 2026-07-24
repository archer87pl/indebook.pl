// Realny klient Channex (REST). Auth nagłówkiem user-api-key. Buildery
// payloadów wydzielone jako czyste funkcje (testowalne bez sieci).

import { mapChannexBooking } from "./booking-map";
import type {
  AriDay,
  BookingData,
  ChannelProvider,
  ProvisionInput,
  ProvisionResult,
} from "./provider";

export function availabilityValues(propertyId: string, roomTypeId: string, days: AriDay[]) {
  return days.map((d) => ({
    property_id: propertyId,
    room_type_id: roomTypeId,
    date: d.date,
    availability: d.availability,
  }));
}

export function restrictionValues(propertyId: string, ratePlanId: string, days: AriDay[]) {
  return days.map((d) => ({
    property_id: propertyId,
    rate_plan_id: ratePlanId,
    date: d.date,
    min_stay_arrival: d.minStay,
  }));
}

type Json = Record<string, unknown> & { data?: { id?: string; attributes?: unknown } };

export class ChannexClient implements ChannelProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string
  ) {}

  private async request(method: string, path: string, body?: unknown): Promise<Json> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: { "user-api-key": this.apiKey, "Content-Type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status >= 500) throw new Error(`Channex HTTP ${res.status}`);
        const json = (await res.json().catch(() => null)) as Json | null;
        if (!res.ok) {
          const detail = json?.errors ? JSON.stringify(json.errors) : `HTTP ${res.status}`;
          throw new Error(`Channex: ${detail}`);
        }
        return json ?? {};
      } catch (e) {
        lastErr = e;
        if (attempt === 2) break;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  async pushAri(
    _apiKey: string,
    channexPropertyId: string,
    roomTypeId: string,
    ratePlanId: string,
    days: AriDay[]
  ): Promise<void> {
    await this.request("POST", "/availability", {
      values: availabilityValues(channexPropertyId, roomTypeId, days),
    });
    if (ratePlanId) {
      await this.request("POST", "/restrictions", {
        values: restrictionValues(channexPropertyId, ratePlanId, days),
      });
    }
  }

  async provisionProperty(input: ProvisionInput): Promise<ProvisionResult> {
    const prop = await this.request("POST", "/properties", {
      property: {
        title: input.name,
        currency: input.currency,
        timezone: input.timezone,
        address: input.address || undefined,
        settings: { allow_availability_autoupdate_on_confirmation: true },
        content: {},
      },
    });
    const channexPropertyId = String(prop.data?.id ?? "");
    const rooms: ProvisionResult["rooms"] = [];
    for (const r of input.rooms) {
      const rt = await this.request("POST", "/room_types", {
        room_type: {
          property_id: channexPropertyId,
          title: r.title,
          count_of_rooms: r.count,
          occ_adults: r.occupancy,
          occ_children: 0,
          occ_infants: 0,
          default_occupancy: r.occupancy,
          room_kind: "room",
        },
      });
      const roomTypeId = String(rt.data?.id ?? "");
      const rp = await this.request("POST", "/rate_plans", {
        rate_plan: {
          property_id: channexPropertyId,
          room_type_id: roomTypeId,
          title: r.title,
          currency: input.currency,
        },
      });
      rooms.push({ unitTypeId: r.unitTypeId, roomTypeId, ratePlanId: String(rp.data?.id ?? "") });
    }
    return { channexPropertyId, apiKey: this.apiKey, rooms };
  }

  async registerWebhook(channexPropertyId: string, callbackUrl: string, secret: string): Promise<void> {
    await this.request("POST", "/webhooks", {
      webhook: {
        property_id: channexPropertyId,
        callback_url: callbackUrl,
        event_mask: "booking",
        headers: { "X-Channex-Webhook-Secret": secret },
        is_active: true,
        send_data: true,
      },
    });
  }

  async getBooking(_apiKey: string, bookingId: string): Promise<BookingData | null> {
    const json = await this.request("GET", `/bookings/${bookingId}`);
    const attrs = json.data?.attributes;
    return attrs ? mapChannexBooking(attrs) : null;
  }
}
