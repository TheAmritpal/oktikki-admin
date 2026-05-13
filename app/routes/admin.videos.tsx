import { Outlet, Link, useLocation } from "react-router";
import { cn } from "~/lib/utils";
import { TrendingUp, Flame } from "lucide-react";

export default function VideosLayout() {
  const location = useLocation();
  const currentTab = location.pathname;

  const tabs = [
    { value: "/admin/videos", label: "All Videos", icon: null },
    { value: "/admin/videos/trending", label: "Trending", icon: TrendingUp },
    { value: "/admin/videos/viral", label: "Viral", icon: Flame },
  ];

  return (
    <div className="space-y-6">
      <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.value;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.value}
              to={tab.value}
              className={cn(
                "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-transparent px-3 py-1 text-sm font-medium whitespace-nowrap transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {tab.label}
            </Link>
          );
        })}
      </div>
      <Outlet />
    </div>
  );
}