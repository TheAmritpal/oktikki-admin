// Firebase Cloud Messaging integration
// This module handles sending push notifications to users

import { db } from "~/db/index.server";
import { user } from "~/db/schema";
import { inArray, isNotNull, ne } from "drizzle-orm";

interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

export async function sendPushToAll(message: PushMessage): Promise<number> {
  const tokens = await db
    .select({ deviceToken: user.deviceToken })
    .from(user)
    .where(ne(user.deviceToken, ""));

  const deviceTokens = tokens
    .map((t) => t.deviceToken)
    .filter(Boolean) as string[];

  if (deviceTokens.length === 0) return 0;

  const sent = await batchSend(deviceTokens, message);
  return sent;
}

export async function sendPushToUsers(
  userIds: number[],
  message: PushMessage
): Promise<number> {
  const tokens = await db
    .select({ deviceToken: user.deviceToken })
    .from(user)
    .where(inArray(user.id, userIds));

  const deviceTokens = tokens
    .map((t) => t.deviceToken)
    .filter(Boolean) as string[];

  if (deviceTokens.length === 0) return 0;

  const sent = await batchSend(deviceTokens, message);
  return sent;
}

async function batchSend(tokens: string[], message: PushMessage): Promise<number> {
  // Firebase Admin SDK or HTTP v1 API integration
  // This is a placeholder that should be implemented with actual
  // Firebase credentials configured in .env
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.warn("Firebase not configured - push notifications disabled");
    return 0;
  }

  // TODO: Implement Firebase Admin SDK batch send
  // const admin = require("firebase-admin");
  // const payload = {
  //   notification: { title: message.title, body: message.body },
  //   data: message.url ? { url: message.url } : undefined,
  // };
  // const response = await admin.messaging().sendEachForMulticast({
  //   tokens,
  //   ...payload,
  // });
  // return response.successCount;

  console.log(`[Firebase] Would send to ${tokens.length} devices:`, message.title);
  return tokens.length;
}