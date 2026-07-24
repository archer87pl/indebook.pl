// Webhook Channex: powiadomienie o rezerwacji (booking*). Weryfikujemy sekret,
// odpowiadamy szybko 200 i w after() dociągamy autorytatywną rezerwację z API
// (webhooki mogą przychodzić poza kolejnością — traktujemy je jako trigger).

import { NextResponse } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { safeEqual } from "@/lib/password";
import { channelProvider } from "@/lib/channex/provider";
import { ingestBooking } from "@/lib/channex/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CHANNEX_WEBHOOK_SECRET ?? "";
  const got = req.headers.get("x-channex-webhook-secret") ?? "";
  if (!secret || !safeEqual(got, secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: {
    event?: string;
    payload?: { booking_id?: string; property_id?: string };
    property_id?: string;
  } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const bookingId = body?.payload?.booking_id;
  const channexPropertyId = body?.payload?.property_id ?? body?.property_id;
  if (body?.event?.startsWith("booking") && bookingId && channexPropertyId) {
    after(async () => {
      const provider = channelProvider();
      const cp = await prisma.channexProperty.findFirst({
        where: { channexId: channexPropertyId },
        select: { apiKey: true },
      });
      if (!provider || !cp) return;
      const booking = await provider.getBooking(cp.apiKey, bookingId);
      if (booking) await ingestBooking(booking);
    });
  }
  return NextResponse.json({ ok: true });
}
