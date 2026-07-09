import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Property, User } from "@prisma/client";
import { prisma } from "./db";

export const SESSION_COOKIE = "rezio_session";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000; // 30 dni

export async function createSession(userId: number): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<
  (User & { property: Property | null }) | null
> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: { include: { property: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

/** Właściciel zalogowany i ma obiekt — inaczej przekierowanie na logowanie. */
export async function requireOwner(): Promise<{
  user: User;
  property: Property;
}> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.property) redirect(user.isAdmin ? "/superadmin" : "/rejestracja");
  return { user: user, property: user.property };
}

/** Globalny administrator platformy. */
export async function requireSuperadmin(): Promise<User> {
  const user = await getSessionUser();
  if (!user?.isAdmin) redirect("/login");
  return user;
}
