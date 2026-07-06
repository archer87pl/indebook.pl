import { prisma } from "@/lib/db";
import { formatPln } from "@/lib/format";
import { sendMail } from "@/lib/mailer";
import {
  type P24Notification,
  verifyP24NotificationSign,
  verifyP24Transaction,
} from "@/lib/payments";

// urlStatus Przelewy24 — potwierdzenie płatności zaliczki.
export async function POST(req: Request) {
  let notification: P24Notification;
  try {
    notification = (await req.json()) as P24Notification;
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!verifyP24NotificationSign(notification)) {
    return new Response("Invalid signature", { status: 400 });
  }

  const reservation = await prisma.reservation.findUnique({
    where: { code: notification.sessionId },
  });
  if (!reservation) return new Response("Unknown session", { status: 404 });
  if (reservation.status === "CONFIRMED") return new Response("OK"); // idempotencja
  if (reservation.status !== "PENDING" || notification.amount !== reservation.depositGr) {
    return new Response("Amount/status mismatch", { status: 400 });
  }

  const verified = await verifyP24Transaction(notification);
  if (!verified) return new Response("Verification failed", { status: 400 });

  await prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      status: "CONFIRMED",
      expiresAt: null,
      paymentOrderId: String(notification.orderId),
    },
  });
  await sendMail({
    to: reservation.email,
    subject: `Rezerwacja ${reservation.code} potwierdzona`,
    body: `Zaliczka ${formatPln(reservation.depositGr)} zaksięgowana (Przelewy24). Do zobaczenia ${reservation.checkIn}!`,
  });
  return new Response("OK");
}
