/**
 * Performance configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { num } from "./helpers";

export const performanceRules: RuleWithFix[] = [
  {
    id: "num-network-threads-low",
    category: "performance",
    evaluate(c) {
      const n = num(c["num.network.threads"]);
      if (n === undefined) return null;
      if (n < 3)
        return {
          severity: "warning",
          title: `num.network.threads=${n} is below the default`,
          detail:
            "Below the default (3) you may bottleneck on network IO before disk. Tune up first; tune down only if you've measured pegged CPU on the network threads.",
          // No safe fix: requires measurement of broker load
        };
      return null;
    },
  },
  {
    id: "num-io-threads-low",
    category: "performance",
    evaluate(c) {
      const n = num(c["num.io.threads"]);
      if (n === undefined) return null;
      if (n < 8)
        return {
          severity: "info",
          title: `num.io.threads=${n} is below the default`,
          detail:
            "Disk IO threads default to 8. If you've lowered this without measurement, you may bottleneck on disk concurrency.",
          // No safe fix: requires capacity testing
        };
      return null;
    },
  },
];
