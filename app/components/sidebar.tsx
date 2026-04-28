import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Shield,
  Video,
  Music,
  Layers,
  Smile,
  Hash,
  FolderTree,
  MessageSquare,
  Image,
  Megaphone,
  Tags,
  Gift,
  Banknote,
  Package,
  Settings,
  FileText,
  AlertTriangle,
  Flag,
  AlertCircle,
  CheckCircle2,
  Building2,
  FileBadge,
  Bell,
  BellRing,
  PanelTop,
  Eye,
  ScrollText,
  Lock,
  Key,
  LogOut,
  ChevronDown,
  X,
} from "lucide-react";
import { cn } from "~/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Analytics", href: "/admin/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Admins", href: "/admin/admins", icon: Shield },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Videos", href: "/admin/videos", icon: Video },
      { label: "Sounds", href: "/admin/sounds", icon: Music },
      { label: "Sound Sections", href: "/admin/sound-sections", icon: Layers },
      { label: "Stickers", href: "/admin/stickers", icon: Smile },
      { label: "Hashtags", href: "/admin/hashtags", icon: Hash },
      { label: "Categories", href: "/admin/categories", icon: FolderTree },
      { label: "Topics", href: "/admin/topics", icon: MessageSquare },
      { label: "App Sliders", href: "/admin/app-sliders", icon: Image },
    ],
  },
  {
    label: "Monetization",
    items: [
      { label: "Promotions", href: "/admin/promotions", icon: Megaphone },
      { label: "Coupons", href: "/admin/coupons", icon: Tags },
      { label: "Gifts", href: "/admin/gifts", icon: Gift },
      { label: "Withdrawals", href: "/admin/withdrawals", icon: Banknote },
      { label: "Orders", href: "/admin/orders", icon: Package },
    ],
  },
  {
    label: "Moderation",
    items: [
      { label: "Reported Videos", href: "/admin/reported-videos", icon: AlertTriangle },
      { label: "Reported Users", href: "/admin/reported-users", icon: Flag },
      { label: "Report Reasons", href: "/admin/report-reasons", icon: AlertCircle },
      { label: "Verification", href: "/admin/verification-requests", icon: CheckCircle2 },
      { label: "Business", href: "/admin/business-submissions", icon: Building2 },
      { label: "Documents", href: "/admin/documents", icon: FileBadge },
      { label: "Nudity Detection", href: "/admin/nudity-detection", icon: Eye },
    ],
  },
  {
    label: "Communication",
    items: [
      { label: "Push Notifications", href: "/admin/push-notifications", icon: Bell },
      { label: "Notifications", href: "/admin/notifications", icon: BellRing },
      { label: "Banners", href: "/admin/banners", icon: PanelTop },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/admin/settings", icon: Settings },
      { label: "HTML Pages", href: "/admin/html-pages", icon: FileText },
      { label: "Audit Logs", href: "/admin/audit-logs", icon: ScrollText },
      { label: "Roles", href: "/admin/roles", icon: Lock },
      { label: "Permissions", href: "/admin/permissions", icon: Key },
    ],
  },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const location = useLocation();

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <Link to="/admin/dashboard" className="flex items-center gap-2 font-bold text-lg">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              O
            </div>
            <span>Oktikki Admin</span>
          </Link>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-sidebar-accent lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {navGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="border-t border-sidebar-border p-4">
          <form method="post" action="/logout">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}