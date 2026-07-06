import { expireReservations } from "@/lib/jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Wywoływane przez Vercel Cron (harmonogram w vercel.json). Vercel dołącza
// nagłówek Authorization: Bearer <CRON_SECRET> — odrzucamy obce żądania.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const count = await expireReservations();
  return Response.json({ ok: true, expired: count });
}
