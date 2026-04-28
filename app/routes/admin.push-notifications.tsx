import { useState } from "react";
import { useFetcher } from "react-router";
import { db } from "~/db/index.server";
import { officialNotification } from "~/db/schema";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { sendNotificationSchema } from "~/lib/validation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { ConfirmDialog } from "~/components/confirm-dialog";
import { Send, Bell, Users, User } from "lucide-react";

export async function action({ request }: { request: Request }) {
  const session = await requireAuth(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "send") {
    const target = String(formData.get("target") || "all");
    const data = {
      title: String(formData.get("title") || ""),
      message: String(formData.get("message") || ""),
      target,
      userIds: String(formData.get("userIds") || "") || undefined,
      url: String(formData.get("url") || "") || undefined,
    };

    const result = sendNotificationSchema.safeParse(data);
    if (!result.success) return { errors: result.error.flatten().fieldErrors };

    if (target === "all") {
      // Insert a single notification record for all users (targetUserId null means all)
      await db.insert(officialNotification).values({
        title: result.data.title,
        message: result.data.message,
        type: "text",
        url: result.data.url || null,
        image: null,
        targetUserId: null,
        isRead: 0,
        created: new Date(),
      });
      console.log("[Push Notification] Sent to ALL users:", result.data.title);
    } else if (target === "specific" && result.data.userIds) {
      const userIdList = result.data.userIds
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id));

      for (const uid of userIdList) {
        await db.insert(officialNotification).values({
          title: result.data.title,
          message: result.data.message,
          type: "text",
          url: result.data.url || null,
          image: null,
          targetUserId: uid,
          isRead: 0,
          created: new Date(),
        });
      }
      console.log(`[Push Notification] Sent to ${userIdList.length} specific users:`, result.data.title);
    }

    await logAudit({
      adminId: session.adminId,
      action: "send_notification",
      entityType: "official_notification",
      newValues: { title: result.data.title, target, message: result.data.message },
      request,
    });

    return { success: true, intent: "send" };
  }

  return { errors: { general: ["Unknown action"] } };
}

export default function PushNotificationsPage() {
  const fetcher = useFetcher();
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
  }>({ open: false, title: "", description: "" });
  const [formState, setFormState] = useState({
    title: "",
    message: "",
    target: "all" as "all" | "specific",
    userIds: "",
    url: "",
  });

  const handleSubmit = () => {
    fetcher.submit(
      {
        intent: "send",
        title: formState.title,
        message: formState.message,
        target: formState.target,
        userIds: formState.userIds,
        url: formState.url,
      },
      { method: "post" }
    );
    setConfirmDialog((prev) => ({ ...prev, open: false }));
  };

  const isFormValid = formState.title.trim() && formState.message.trim()
    && (formState.target === "all" || formState.userIds.trim());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Push Notifications</h2>
        <p className="text-muted-foreground">
          Send push notifications to users.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle>Compose Notification</CardTitle>
            <CardDescription>Fill in the details to send a push notification.</CardDescription>
          </CardHeader>
          <CardContent>
            <fetcher.Form method="post" className="space-y-4">
              <input type="hidden" name="intent" value="send" />
              <div className="space-y-2">
                <Label htmlFor="notif-title">Title</Label>
                <Input
                  id="notif-title"
                  name="title"
                  placeholder="Notification title"
                  value={formState.title}
                  onChange={(e) => setFormState((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notif-message">Message</Label>
                <Textarea
                  id="notif-message"
                  name="message"
                  placeholder="Notification message"
                  value={formState.message}
                  onChange={(e) => setFormState((prev) => ({ ...prev, message: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Target Audience</Label>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="target"
                      value="all"
                      checked={formState.target === "all"}
                      onChange={() => setFormState((prev) => ({ ...prev, target: "all" }))}
                      className="h-4 w-4"
                    />
                    <Users className="h-4 w-4" />
                    <span className="text-sm">All Users</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="target"
                      value="specific"
                      checked={formState.target === "specific"}
                      onChange={() => setFormState((prev) => ({ ...prev, target: "specific" }))}
                      className="h-4 w-4"
                    />
                    <User className="h-4 w-4" />
                    <span className="text-sm">Specific Users</span>
                  </label>
                </div>
              </div>
              {formState.target === "specific" && (
                <div className="space-y-2">
                  <Label htmlFor="notif-userIds">User IDs (comma-separated)</Label>
                  <Input
                    id="notif-userIds"
                    name="userIds"
                    placeholder="e.g. 1, 2, 3"
                    value={formState.userIds}
                    onChange={(e) => setFormState((prev) => ({ ...prev, userIds: e.target.value }))}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="notif-url">URL (optional)</Label>
                <Input
                  id="notif-url"
                  name="url"
                  placeholder="https://example.com"
                  value={formState.url}
                  onChange={(e) => setFormState((prev) => ({ ...prev, url: e.target.value }))}
                />
              </div>
              <Button
                type="button"
                className="w-full"
                disabled={!isFormValid || fetcher.state === "submitting"}
                onClick={() =>
                  setConfirmDialog({
                    open: true,
                    title: "Send Notification",
                    description: `Are you sure you want to send this notification to ${formState.target === "all" ? "all users" : "specific users"}?`,
                  })
                }
              >
                <Send className="mr-2 h-4 w-4" />
                {fetcher.state === "submitting" ? "Sending..." : "Send Notification"}
              </Button>
            </fetcher.Form>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>How the notification will appear to users.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm truncate">
                    {formState.title || "Notification Title"}
                  </p>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {formState.message || "Notification message will appear here..."}
                  </p>
                  {formState.url && (
                    <p className="text-xs text-primary mt-1 truncate">
                      {formState.url}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5">
                  {formState.target === "all" ? (
                    <><Users className="h-3 w-3" /> All Users</>
                  ) : (
                    <><User className="h-3 w-3" /> Specific Users</>
                  )}
                </span>
                <span>Just now</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={handleSubmit}
      />
    </div>
  );
}