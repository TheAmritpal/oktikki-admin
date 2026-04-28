import { redirect } from "react-router";
import { Outlet, useLoaderData } from "react-router";
import { requireAuth } from "~/lib/auth.server";
import { AdminLayout } from "~/components/admin-layout";
import type { SessionData } from "~/types";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  return { session };
}

export default function AdminRoute() {
  const { session } = useLoaderData<typeof loader>();
  return <AdminLayout />;
}