import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: { value: number; label: string };
  variant?: "default" | "primary" | "secondary" | "accent" | "success" | "warning";
}

const variantStyles = {
  default: "bg-card",
  primary: "bg-primary/5 border-primary/20",
  secondary: "bg-secondary/5 border-secondary/20",
  accent: "bg-accent/10 border-accent/30",
  success: "bg-[hsl(var(--success))]/5 border-[hsl(var(--success))]/20",
  warning: "bg-[hsl(var(--warning))]/5 border-[hsl(var(--warning))]/20",
};

const iconStyles = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  accent: "bg-accent/20 text-accent-foreground",
  success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
};

export default function StatsCard({ title, value, icon: Icon, description, trend, variant = "default" }: StatsCardProps) {
  return (
    <Card className={cn("transition-all hover:shadow-md", variantStyles[variant])}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            {trend && (
              <p className={cn("text-xs font-medium", trend.value >= 0 ? "text-[hsl(var(--success))]" : "text-destructive")}>
                {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}% {trend.label}
              </p>
            )}
          </div>
          <div className={cn("p-2.5 rounded-lg", iconStyles[variant])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
