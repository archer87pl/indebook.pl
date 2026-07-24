// Start OAuth Airbnb: generuje podpisany state i przekierowuje do autoryzacji
// (URL dostarcza Channex). Wymaga zalogowanego właściciela w planie Pro z aktywnym Channex.
import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { channelSyncFeatures } from "@/lib/plans";
import { channelProvider } from "@/lib/channex/provider";
import { signState } from "@/lib/channex/oauth-state";
import { appUrl } from "@/lib/payments";

export const dynamic = "force-dynamic";

export async function GET() {
  const { property } = await requireOwner();
  if (!channelSyncFeatures(property.plan).channex) {
    return NextResponse.redirect(`${appUrl()}/admin/kanaly?error=${encodeURIComponent("Wymagany plan Pro.")}`);
  }
  const provider = channelProvider();
  const cp = await prisma.channexProperty.findUnique({ where: { propertyId: property.id } });
  if (!provider || !cp || cp.status !== "ACTIVE") {
    return NextResponse.redirect(`${appUrl()}/admin/kanaly?error=${encodeURIComponent("Dokończ konfigurację Channex.")}`);
  }
  const state = signState(property.id);
  const redirectUrl = `${appUrl()}/api/channex/airbnb/callback?state=${encodeURIComponent(state)}`;
  const { authUrl } = await provider.startAirbnbOAuth(cp.channexId, redirectUrl);
  // stub zwraca ścieżkę względną z placeholderem STATE — podstawiamy realny state
  const target = authUrl.replace("STATE", encodeURIComponent(state));
  return NextResponse.redirect(target.startsWith("http") ? target : `${appUrl()}${target}`);
}
