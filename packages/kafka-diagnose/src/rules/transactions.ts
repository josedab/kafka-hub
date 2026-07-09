/**
 * Transaction configuration diagnostic rules.
 */

import type { RuleWithFix } from "./helpers";
import { num, replaceFix } from "./helpers";

export const transactionRules: RuleWithFix[] = [
  {
    id: "transactional-id-fixed",
    category: "transactions",
    evaluate(c) {
      const tid = c["transactional.id"];
      if (tid === undefined) return null;
      if (tid === "" || /random|uuid|guid/i.test(tid))
        return {
          severity: "warning",
          title: "transactional.id looks generated per-run, defeating fencing",
          detail:
            "transactional.id must be stable per logical producer instance. A random per-restart ID means zombie producers cannot be fenced by epoch. Derive from pod name, hostname, or another stable identifier.",
          learnSlug: "exactly-once",
          // No safe fix: requires knowledge of deployment topology
        };
      return null;
    },
  },
  {
    id: "transaction-state-rf-low",
    category: "transactions",
    evaluate(c) {
      const rf = num(c["transaction.state.log.replication.factor"]);
      if (rf === undefined) return null;
      if (rf < 3)
        return {
          severity: "danger",
          title: "transaction.state.log.replication.factor < 3",
          detail:
            "The __transaction_state topic backs every transactional producer. RF<3 means a single broker loss can stall transactions across the cluster. Set to 3.",
          learnSlug: "exactly-once",
          structuredFix: replaceFix(
            "Set transaction state RF to 3",
            "transaction.state.log.replication.factor",
            String(rf),
            "3",
          ),
        };
      return null;
    },
  },
  {
    id: "offsets-topic-rf-low",
    category: "transactions",
    evaluate(c) {
      const rf = num(c["offsets.topic.replication.factor"]);
      if (rf === undefined) return null;
      if (rf < 3)
        return {
          severity: "danger",
          title: "offsets.topic.replication.factor < 3",
          detail:
            "__consumer_offsets backs every committed offset. RF<3 means a broker loss can drop committed offsets and your consumers will replay from earlier in the log. Set to 3.",
          structuredFix: replaceFix(
            "Set offsets topic RF to 3",
            "offsets.topic.replication.factor",
            String(rf),
            "3",
          ),
        };
      return null;
    },
  },
];
