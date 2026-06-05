"use server";

import { revalidatePath } from "next/cache";
import type {
  UpdateNotificationsRequest,
  UserNotificationSettings,
} from "@psico/types";

import { serverFetch } from "@/lib/api.server";

/**
 * Server action — Sprint S45.
 *
 * Updates the user's NotificationSettings via PATCH /api/user/notifications
 * and revalidates the settings page so the next render reflects what we
 * just saved. We accept a Partial so the form can submit only the toggle
 * that changed; the backend layers a sensible default for `reminderTime`.
 */
export async function updateNotificationsAction(
  body: UpdateNotificationsRequest,
): Promise<UserNotificationSettings> {
  const next = await serverFetch<UserNotificationSettings>(
    "/user/notifications",
    {
      method: "PATCH",
      body,
    },
  );
  revalidatePath("/dashboard/notifications");
  revalidatePath("/dashboard");
  return next;
}
