import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

    const getColor = () => {
      if (percentage >= 90) return "bg-red-500";
      if (percentage >= 70) return "bg-yellow-500";
      return "bg-primary";
    };

    return (
      <div ref={ref} className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)} {...props}>
        <div className={cn("h-full transition-all duration-300", getColor())} style={{ width: `${percentage}%` }} />
      </div>
    );
  }
);
Progress.displayName = "Progress";

export { Progress };
