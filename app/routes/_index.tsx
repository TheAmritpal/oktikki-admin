import { redirect } from "react-router";
import { getSession } from "~/lib/auth.server";

export async function loader({ request }: { request: Request }) {
  const session = getSession(request);
  if (session) {
    throw redirect("/admin/dashboard");
  }
  throw redirect("/login");
}

export default function Index() {
  return null;
}