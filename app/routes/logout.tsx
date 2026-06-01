import { redirect } from "react-router";
import { getSession, destroySessionCookie } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";

export async function action({ request }: { request: Request }) {
  const session = getSession(request);

  if (session) {
    await logAudit({
      adminId: session.adminId,
      action: "logout",
      entityType: "admin",
      entityId: session.adminId,
      request,
    });
  }

  return redirect("/login", {
    headers: { "Set-Cookie": destroySessionCookie() },
  });
}