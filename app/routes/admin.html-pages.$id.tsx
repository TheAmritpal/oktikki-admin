import { useState } from "react";
import { Link, useLoaderData, useFetcher } from "react-router";
import { db } from "~/db/index.server";
import { htmlPage } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "~/lib/auth.server";
import { logAudit } from "~/lib/audit.server";
import { RichTextEditor } from "~/components/rich-text-editor";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";

export async function loader({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const pageId = Number(params.id);

  const [pageData] = await db.select({
    id: htmlPage.id,
    name: htmlPage.name,
    text: htmlPage.text,
    created: htmlPage.created,
  }).from(htmlPage).where(eq(htmlPage.id, pageId)).limit(1);

  if (!pageData) {
    throw new Response("Page not found", { status: 404 });
  }

  return {
    session,
    page: pageData,
  };
}

export async function action({ request, params }: { request: Request; params: { id: string } }) {
  const session = await requireAuth(request);
  const pageId = Number(params.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "update") {
    const text = String(formData.get("text") || "");

    const [oldPage] = await db.select({ text: htmlPage.text }).from(htmlPage).where(eq(htmlPage.id, pageId)).limit(1);
    await db.update(htmlPage).set({ text }).where(eq(htmlPage.id, pageId));
    await logAudit({
      adminId: session.adminId,
      action: "update_html_page",
      entityType: "html_page",
      entityId: pageId,
      oldValues: { text: oldPage?.text ? "(previous content)" : null },
      newValues: { text: "(updated content)" },
      request,
    });
    return { success: true, intent: "update" };
  }

  return { errors: { general: ["Unknown action"] } };
}

export default function HtmlPageEditorPage() {
  const { page } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [content, setContent] = useState(page.text);

  const handleSave = () => {
    fetcher.submit({ intent: "update", text: content }, { method: "post" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/admin/html-pages" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to HTML Pages
          </Link>
        </div>
        <Button onClick={handleSave} disabled={fetcher.state === "submitting"}>
          <Save className="mr-1 h-4 w-4" />
          {fetcher.state === "submitting" ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{page.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <RichTextEditor
            value={content}
            onChange={setContent}
            className="min-h-[400px]"
          />
        </CardContent>
      </Card>

      {fetcher.data && "success" in fetcher.data && fetcher.data.success && (
        <p className="text-sm text-green-600 dark:text-green-400">Page saved successfully.</p>
      )}
    </div>
  );
}