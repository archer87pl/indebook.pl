"use server";

// Akcje panelu: przełączanie trybu synchronizacji kanałów obiektu.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "../auth";
import { prisma } from "../db";
import { channelSyncFeatures } from "../plans";
import { channelProvider } from "./provider";

const MODES = ["OFF", "ICAL", "CHANNEX"] as const;

export async function setSyncMode(formData: FormData): Promise<void> {
  const { property } = await requireOwner();
  const mode = String(formData.get("mode") ?? "");
  const fail = (m: string) => redirect(`/admin/kanaly?error=${encodeURIComponent(m)}`);

  if (!MODES.includes(mode as (typeof MODES)[number])) fail("Nieznany tryb synchronizacji.");
  const feat = channelSyncFeatures(property.plan);
  if (mode === "ICAL" && !feat.ical) fail("Synchronizacja iCal jest dostępna od planu Standard.");
  if (mode === "CHANNEX" && (!feat.channex || !channelProvider())) {
    fail("Channex jest dostępny w planie Pro po włączeniu integracji na platformie.");
  }

  await prisma.property.update({ where: { id: property.id }, data: { syncMode: mode } });
  revalidatePath("/admin/kanaly");
  redirect("/admin/kanaly?saved=1");
}
