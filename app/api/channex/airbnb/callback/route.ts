// Callback OAuth Airbnb: weryfikuje state, finalizuje połączenie w Channex,
// zapisuje kanał AIRBNB i wraca do panelu.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/log";
import { channelProvider } from "@/lib/channex/provider";
import { verifyState } from "@/lib/channex/oauth-state";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const propertyId = verifyState(state);
  const back = `${appUrl()}/admin/kanaly`;
  if (!propertyId || !code) {
    return NextResponse.redirect(`${back}?error=${encodeURIComponent("Nieprawidłowa autoryzacja Airbnb.")}`);
  }
  const provider = channelProvider();
  const cp = await prisma.channexProperty.findUnique({ where: { propertyId } });
  if (!provider || !cp) {
    return NextResponse.redirect(`${back}?error=${encodeURIComponent("Brak konfiguracji Channex.")}`);
  }
  try {
    const res = await provider.finishAirbnbOAuth(cp.channexId, code);
    await prisma.channexChannel.upsert({
      where: { propertyId_type: { propertyId, type: "AIRBNB" } },
      create: { propertyId, type: "AIRBNB", channexChannelId: res.channelId, status: res.status.toUpperCase() },
      update: { channexChannelId: res.channelId, status: res.status.toUpperCase(), lastError: "" },
    });
    await logEvent({ kind: "CHANNEX", level: "INFO", propertyId, message: "Podłączono kanał Airbnb (OAuth)" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.channexChannel.upsert({
      where: { propertyId_type: { propertyId, type: "AIRBNB" } },
      create: { propertyId, type: "AIRBNB", status: "ERROR", lastError: msg.slice(0, 300) },
      update: { status: "ERROR", lastError: msg.slice(0, 300) },
    });
    return NextResponse.redirect(`${back}?error=${encodeURIComponent(msg)}`);
  }
  return NextResponse.redirect(`${back}?saved=1`);
}
