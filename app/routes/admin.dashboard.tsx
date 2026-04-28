import { requireAuth } from "~/lib/auth.server";
import { BarChart3, Users, Video, Banknote, AlertTriangle, CheckCircle2, Package, Radio } from "lucide-react";
import { StatCard } from "~/components/stat-card";

export async function loader({ request }: { request: Request }) {
  const session = await requireAuth(request);
  return { session };
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Overview of your platform&apos;s key metrics.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value="--"
          icon={Users}
        />
        <StatCard
          title="Total Videos"
          value="--"
          icon={Video}
        />
        <StatCard
          title="Pending Withdrawals"
          value="--"
          icon={Banknote}
        />
        <StatCard
          title="Pending Verifications"
          value="--"
          icon={CheckCircle2}
        />
        <StatCard
          title="Reported Videos"
          value="--"
          icon={AlertTriangle}
        />
        <StatCard
          title="Today&apos;s Orders"
          value="--"
          icon={Package}
        />
        <StatCard
          title="Active Streams"
          value="--"
          icon={Radio}
        />
        <StatCard
          title="Analytics"
          value="--"
          icon={BarChart3}
        />
      </div>

      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        <p>Connect to the database to see live stats.</p>
        <p className="text-sm mt-2">
          Run <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">npx drizzle-kit push</code> to set up the database schema.
        </p>
      </div>
    </div>
  );
}