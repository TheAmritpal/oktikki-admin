import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";

const statusVariants: Record<
  string,
  { className: string; label?: string }
> = {
  active: {
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  blocked: {
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  pending: {
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  approved: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  rejected: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  live: {
    className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
  ended: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  ongoing: {
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  upcoming: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  finished: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  processing: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  shipped: {
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  delivered: {
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  cancelled: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  completed: {
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  text: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
  url: {
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  verified: {
    className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  unverified: {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const variant = statusVariants[status.toLowerCase()] || {
    className: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  };

  return (
    <Badge
      variant="secondary"
      className={cn(variant.className, className)}
    >
      {variant.label || status}
    </Badge>
  );
}