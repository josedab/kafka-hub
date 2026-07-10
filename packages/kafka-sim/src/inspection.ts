/** Read-only simulator inspection helpers. */

import type { ClusterState } from "./engine-types";

// ───────────────────────── inspection helpers ─────────────────────────

export function totalLag(state: ClusterState): number {
  let lag = 0;
  for (const g of state.groups) {
    for (const m of g.members) {
      if (!m.alive) continue;
      for (const pId of m.assigned) {
        const p = state.topic.partitions.find((x) => x.id === pId);
        if (!p) continue;
        lag += Math.max(0, p.hw - (m.committed[pId] ?? 0));
      }
    }
  }
  return lag;
}

