import { syncAllIcalFeeds } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Wywoływane przez Vercel Cron (harmonogram w vercel.json). Vercel dołącza
// nagłówek Authorization: Bearer <CRON_SECRET> — odrzucamy obce żądania.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const feeds = await syncAllIcalFeeds();
  return Response.json({ ok: true, feeds });
}
