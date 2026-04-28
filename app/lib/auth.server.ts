import { redirect } from "react-router";
import { db } from "~/db/index.server";
import { admin, adminRole, role, rolePermission, permission } from "~/db/schema";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import cookie from "cookie";
import type { SessionData } from "~/types";

const SESSION_COOKIE_NAME = "oktikki_admin_session";
const SESSION_MAX_AGE = 12 * 60 * 60; // 12 hours in seconds
const SESSION_SECRET = process.env.SESSION_SECRET || "oktikki-admin-session-secret-change-in-production-min-32-chars";

function encrypt(data: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(SESSION_SECRET, "salt", 32);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  return Buffer.from(`${iv.toString("hex")}:${encrypted.toString("hex")}`).toString("base64url");
}

function decrypt(data: string): string | null {
  try {
    const decoded = Buffer.from(data, "base64url").toString("utf8");
    const [ivHex, encryptedHex] = decoded.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const key = crypto.scryptSync(SESSION_SECRET, "salt", 32);
    const encryptedText = Buffer.from(encryptedHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}

export function getSession(request: Request): SessionData | null {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookie.parse(cookieHeader);
  const sessionCookie = cookies[SESSION_COOKIE_NAME];
  if (!sessionCookie) return null;

  const decrypted = decrypt(sessionCookie);
  if (!decrypted) return null;

  try {
    return JSON.parse(decrypted) as SessionData;
  } catch {
    return null;
  }
}

export function createSessionCookie(sessionData: SessionData): string {
  const encrypted = encrypt(JSON.stringify(sessionData));
  return cookie.serialize(SESSION_COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function destroySessionCookie(): string {
  return cookie.serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.APP_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  // CakePHP Blowfish hashing uses standard bcrypt ($2a$10$...) which is
  // fully compatible with bcryptjs.compareSync
  return bcryptjs.compareSync(plainPassword, hashedPassword);
}

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcryptjs.hashSync(plainPassword, 10);
}

export async function requireAuth(request: Request): Promise<SessionData> {
  const session = getSession(request);
  if (!session) {
    throw redirect("/login");
  }
  return session;
}

export async function requirePermission(request: Request, requiredPermission: string): Promise<SessionData> {
  const session = await requireAuth(request);

  // super_admin has all permissions
  if (session.role === "super_admin") {
    return session;
  }

  if (!session.permissions.includes(requiredPermission)) {
    throw new Response("Forbidden", { status: 403 });
  }

  return session;
}

export async function getAdminPermissions(adminId: number): Promise<string[]> {
  const result = await db
    .select({ permissionName: permission.name })
    .from(adminRole)
    .innerJoin(role, eq(adminRole.roleId, role.id))
    .innerJoin(rolePermission, eq(role.id, rolePermission.roleId))
    .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
    .where(eq(adminRole.adminId, adminId));

  return result.map((r) => r.permissionName);
}

export async function getAdminRole(adminId: number): Promise<string> {
  const result = await db
    .select({ roleName: role.name })
    .from(adminRole)
    .innerJoin(role, eq(adminRole.roleId, role.id))
    .where(eq(adminRole.adminId, adminId))
    .limit(1);

  return result[0]?.roleName || "admin";
}