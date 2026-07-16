"use client";

import { cn } from "@/lib/cn";
import type { Category } from "@/lib/diagnostic-rules";

const ALL_CATEGORIES: Category[] = [
  "validation",
  "broker",
  "topic",
  "producer",
  "consumer",
  "transactions",
  "security",
  "performance",
];

interface CategoryFilterProps {
  activeCategories: Set<Category>;
  categoryCounts: Map<Category, number>;
  totalRulesByCategory: Map<Category, number>;
  onToggle: (category: Category) => void;
}

export { ALL_CATEGORIES };

export function CategoryFilter({
  activeCategories,
  categoryCounts,
  totalRulesByCategory,
  onToggle,
}: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALL_CATEGORIES.map((c) => {
        const matched = categoryCounts.get(c) ?? 0;
        const total = totalRulesByCategory.get(c) ?? 0;
        const active = activeCategories.has(c);
        return (
          <button
            key={c}
            type="button"
            onClick={() => onToggle(c)}
            aria-pressed={active}
            className={cn(
              "min-h-[44px] min-w-[44px] rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring",
              active
                ? "border-fd-foreground bg-fd-foreground text-fd-background"
                : "border-fd-border text-fd-muted-foreground hover:bg-fd-accent",
            )}
            title={`${total} rules in this category`}
          >
            {c} {matched > 0 ? `\u00b7 ${matched}` : ""}
          </button>
        );
      })}
    </div>
  );
}
