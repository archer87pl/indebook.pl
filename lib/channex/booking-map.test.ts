import { describe, expect, it } from "vitest";
import { mapChannexBooking, otaNameToSource } from "./booking-map";

const attrs = {
  id: "b1",
  property_id: "P",
  status: "new",
  revision_id: "r1",
  ota_name: "Booking.com",
  arrival_date: "2026-08-01",
  departure_date: "2026-08-04",
  amount: "660.00",
  customer: { name: "Jan", surname: "Kowalski", mail: "j@x.pl", phone: "600100200" },
  rooms: [{ room_type_id: "RT7", occupancy: { adults: 2, children: 1 } }],
};

describe("mapChannexBooking", () => {
  it("mapuje booking Channex na BookingData", () => {
    const b = mapChannexBooking(attrs);
    expect(b).toMatchObject({
      channexBookingId: "b1",
      channexPropertyId: "P",
      channexRoomTypeId: "RT7",
      channel: "BOOKING",
      status: "new",
      arrival: "2026-08-01",
      departure: "2026-08-04",
      guests: 3,
      guestName: "Jan Kowalski",
      email: "j@x.pl",
      phone: "600100200",
      totalGr: 66000,
      commissionGr: 0,
    });
  });
});

describe("otaNameToSource", () => {
  it("mapuje nazwy OTA na source", () => {
    expect(otaNameToSource("Booking.com")).toBe("BOOKING");
    expect(otaNameToSource("Airbnb")).toBe("AIRBNB");
    expect(otaNameToSource("Expedia")).toBe("EXPEDIA");
    expect(otaNameToSource("Nieznany")).toBe("CHANNEX_OTHER");
  });
});
