import { Menu, Moon, Sun, Bell } from "lucide-react";
import { useTheme } from "~/components/theme-provider";
import { useLocation } from "react-router";

const routeLabels: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/analytics": "Analytics",
  "/admin/users": "Users",
  "/admin/admins": "Admins",
  "/admin/videos": "Videos",
  "/admin/sounds": "Sounds",
  "/admin/sound-sections": "Sound Sections",
  "/admin/stickers": "Stickers",
  "/admin/hashtags": "Hashtags",
  "/admin/categories": "Categories",
  "/admin/topics": "Topics",
  "/admin/app-sliders": "App Sliders",
  "/admin/promotions": "Promotions",
  "/admin/coupons": "Coupons",
  "/admin/gifts": "Gifts",
  "/admin/withdrawals": "Withdrawals",
  "/admin/orders": "Orders",
  "/admin/settings": "Settings",
  "/admin/html-pages": "HTML Pages",
  "/admin/reported-videos": "Reported Videos",
  "/admin/reported-users": "Reported Users",
  "/admin/report-reasons": "Report Reasons",
  "/admin/verification-requests": "Verification Requests",
  "/admin/business-submissions": "Business Submissions",
  "/admin/documents": "Documents",
  "/admin/push-notifications": "Push Notifications",
  "/admin/notifications": "Notifications",
  "/admin/banners": "Banners",
  "/admin/nudity-detection": "Nudity Detection",
  "/admin/audit-logs": "Audit Logs",
  "/admin/live-streams": "Live Streams",
  "/admin/rooms": "Voice Rooms",
  "/admin/roles": "Roles",
  "/admin/permissions": "Permissions",
};

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { theme, setTheme } = useTheme();
  const location = useLocation();

  const pageLabel =
    routeLabels[location.pathname] ||
    Object.entries(routeLabels).find(([path]) =>
      location.pathname.startsWith(path + "/")
    )?.[1] ||
    "Admin";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-4 lg:px-6">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 hover:bg-accent lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Page title / breadcrumbs */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold">{pageLabel}</h1>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* Notifications (placeholder) */}
        <button className="relative rounded-md p-2 hover:bg-accent">
          <Bell className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="rounded-md p-2 hover:bg-accent"
          suppressHydrationWarning
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Moon className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </div>
    </header>
  );
}