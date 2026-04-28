import { redirect } from "react-router";
import { Form, useActionData, useNavigation } from "react-router";
import { db } from "~/db/index.server";
import { admin } from "~/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword, createSessionCookie, getSession } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { loginSchema } from "~/lib/validation";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

export async function loader({ request }: { request: Request }) {
  const session = getSession(request);
  if (session) {
    throw redirect("/admin/dashboard");
  }
  return {};
}

export async function action({ request }: { request: Request }) {
  const formData = await request.formData();
  const rawData = Object.fromEntries(formData);

  const result = loginSchema.safeParse(rawData);
  if (!result.success) {
    return { errors: result.error.flatten().fieldErrors };
  }

  const { email, password } = result.data;

  const [adminUser] = await db
    .select()
    .from(admin)
    .where(eq(admin.email, email))
    .limit(1);

  if (!adminUser) {
    return { errors: { email: ["Invalid email or password"] } };
  }

  if (adminUser.active !== 1) {
    return { errors: { email: ["Account is disabled"] } };
  }

  const isValid = await verifyPassword(password, adminUser.password);
  if (!isValid) {
    return { errors: { email: ["Invalid email or password"] } };
  }

  // Audit log is best-effort (table may not exist yet)
  try {
    await logAudit({
      adminId: adminUser.id,
      action: "login",
      entityType: "admin",
      entityId: adminUser.id,
      request,
    });
  } catch {}

  const sessionData = {
    adminId: adminUser.id,
    email: adminUser.email,
    name: `${adminUser.firstName} ${adminUser.lastName}`,
    role: adminUser.role || "admin",
    permissions: [] as string[],
  };

  const cookie = createSessionCookie(sessionData);

  throw redirect("/admin/dashboard", {
    headers: { "Set-Cookie": cookie },
  });
}

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground text-xl font-bold">
            O
          </div>
          <CardTitle className="text-2xl">Oktikki Admin</CardTitle>
          <CardDescription>Sign in to manage your platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="admin@oktikki.com"
                required
              />
              {actionData?.errors?.email && (
                <p className="text-sm text-destructive">{actionData.errors.email[0]}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                required
              />
              {actionData?.errors?.password && (
                <p className="text-sm text-destructive">{actionData.errors.password[0]}</p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}