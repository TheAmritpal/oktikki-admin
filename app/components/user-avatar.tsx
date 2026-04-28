import { cn } from "~/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { CheckCircle2 } from "lucide-react";

interface UserAvatarProps {
  src?: string | null;
  name: string;
  size?: "sm" | "md" | "lg";
  verified?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function UserAvatar({
  src,
  name,
  size = "md",
  verified = false,
  className,
}: UserAvatarProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <Avatar className={sizeClasses[size]}>
        <AvatarImage src={src || undefined} alt={name} />
        <AvatarFallback className={textSizeClasses[size]}>
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      {verified && (
        <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 h-4 w-4 fill-blue-500 text-white" />
      )}
    </div>
  );
}