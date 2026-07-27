import { refreshAllRates } from "@/lib/jobs";
import { safeEqual } from "@/lib/password";

export const dynamic = "force-dynamic";
// domyślny i maksymalny limit Vercela to 300 s (także na Hobby);
// odbudowa horyzontu bywa długa, więc bierzemy cały dostępny czas
export const maxDuration = 300;

// Wywoływane przez Vercel Cron (harmonogram w vercel.json). Fail-closed:
// bez skonfigurowanego CRON_SECRET endpoint jest niedostępny.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(req.headers.get("authorization") ?? "", `Bearer ${secret}`)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await refreshAllRates();
  return Response.json({ ok: true, ...result });
}
