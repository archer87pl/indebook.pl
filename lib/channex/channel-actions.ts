"use server";

// Akcje panelu: podłączanie kanałów OTA (Booking.com kreator, odświeżanie statusu).
// Airbnb idzie przez OAuth (route'y start/callback).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "../auth";
import { prisma } from "../db";
import { logEvent } from "../log";
import { channelSyncFeatures } from "../plans";
import { channelProvider } from "./provider";

async function requireChannel() {
  const { property } = await requireOwner();
  if (!channelSyncFeatures(property.plan).channex) {
    redirect("/admin/kanaly?error=" + encodeURIComponent("Channex jest dostępny w planie Pro."));
  }
  const provider = channelProvider();
  const cp = await prisma.channexProperty.findUnique({ where: { propertyId: property.id } });
  if (!provider || !cp || cp.status !== "ACTIVE") {
    redirect("/admin/kanaly?error=" + encodeURIComponent("Najpierw dokończ konfigurację Channex."));
  }
  return { property, provider, cp };
}

export async function connectBookingChannel(formData: FormData): Promise<void> {
  const { property, provider, cp } = await requireChannel();
  const hotelId = String(formData.get("hotelId") ?? "").trim();
  if (!/^\d{3,}$/.test(hotelId)) {
    redirect("/admin/kanaly?error=" + encodeURIComponent("Podaj poprawny Hotel ID z Booking.com."));
  }
  const rooms = await prisma.channexRoom.findMany({
    where: { unitType: { propertyId: property.id } },
    select: { channexRoomTypeId: true, channexRatePlanId: true },
  });
  try {
    const res = await provider.connectBooking(
      cp.channexId,
      hotelId,
      rooms.map((r) => ({ roomTypeId: r.channexRoomTypeId, ratePlanId: r.channexRatePlanId }))
    );
    await prisma.channexChannel.upsert({
      where: { propertyId_type: { propertyId: property.id, type: "BOOKING" } },
      create: { propertyId: property.id, type: "BOOKING", channexChannelId: res.channelId, status: res.status.toUpperCase() },
      update: { channexChannelId: res.channelId, status: res.status.toUpperCase(), lastError: "" },
    });
    await logEvent({ kind: "CHANNEX", level: "INFO", propertyId: property.id, message: "Podłączono kanał Booking.com", meta: hotelId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.channexChannel.upsert({
      where: { propertyId_type: { propertyId: property.id, type: "BOOKING" } },
      create: { propertyId: property.id, type: "BOOKING", status: "ERROR", lastError: msg.slice(0, 300) },
      update: { status: "ERROR", lastError: msg.slice(0, 300) },
    });
    redirect("/admin/kanaly?error=" + encodeURIComponent(msg));
  }
  revalidatePath("/admin/kanaly");
  redirect("/admin/kanaly?saved=1");
}

export async function refreshChannelStatus(formData: FormData): Promise<void> {
  const { property, provider } = await requireChannel();
  const type = String(formData.get("type") ?? "");
  const ch = await prisma.channexChannel.findUnique({
    where: { propertyId_type: { propertyId: property.id, type } },
  });
  if (ch?.channexChannelId) {
    try {
      const st = await provider.channelStatus(ch.channexChannelId);
      await prisma.channexChannel.update({
        where: { id: ch.id },
        data: { status: st.status.toUpperCase(), lastError: st.message },
      });
    } catch {
      // zostaw poprzedni status
    }
  }
  revalidatePath("/admin/kanaly");
  redirect("/admin/kanaly?saved=1");
}
