# Contributing

Thanks for your interest in the Kafka Engineering Hub. This is an open-source
project built in public.

## Ground rules

- Be kind. Disagree on technical specifics, never on the person.
- Don't open a PR for cosmetic-only changes (whitespace, reformatting) unless
  the existing formatting is broken.
- Performance, correctness and accessibility regressions block a merge.
- New runtime dependencies need a one-line justification in the PR description.

## What we welcome

In priority order:

1. **Bug reports.** Especially anything in the diagnostic engine that produces
   a false positive or misses an obvious footgun.
2. **New diagnostic rules.** Each rule is a single object in
   `packages/kafka-diagnose/src/rules.ts`. See the `Rule` interface in
   `types.ts`. New rules should include the `category` field and, when
   relevant, a `learnSlug` pointing at an explainer article.
3. **Learn articles.** Drop a new MDX file under `content/learn/<slug>.mdx`,
   register it in `meta.json`, and add the `date` field (quoted as a string —
   YAML auto-parses unquoted dates into `Date` objects). Each article must
   ship with at least one interactive component and link to the relevant
   Diagnose rules and Simulate scenarios.
4. **Simulator scenarios.** Add a new `Scenario` to
   `packages/kafka-sim/src/scenarios.ts`. Scenarios are pure data plus a
   linear script of ops (`wait`, `produce`, `killBroker`, etc.). Static
   `generateStaticParams()` in `app/simulate/embed/[scenario]/page.tsx`
   picks them up automatically.
5. **CLI improvements.** The CLI in `packages/kafka-cli/` reuses the
   diagnose engine — keep parity with the web UI.

## What we won't merge

- Real Kafka client code in the browser. This is a teaching tool; the
  simulator stays deterministic and in-process.
- LLM features that don't have cost controls.
- Anything that adds authentication, telemetry beyond anonymous page views,
  or a monetization path without a prior discussion in an issue.

## Local development

The only required tools are Node.js 22+ and the pnpm version pinned in the
root `package.json`. You do **not** need Kafka, Docker, Redis, a database, an
Anthropic key, or a browser test runner.

```bash
corepack enable # only needed when pnpm is not already available
pnpm install
pnpm dev
```

For a non-interactive shell or automation, use:

```bash
CI=true pnpm install --frozen-lockfile
```

All default tests are hermetic. The optional Anthropic path is covered with an
in-process fake; tests never call the live API.

Before opening a PR:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For changes inside `packages/kafka-cli/`, also smoke-test the binary:

```bash
pnpm --filter @kafka-hub/kafka-cli build
node packages/kafka-cli/bin/kafka-hub.mjs diagnose ./your-test.properties
```

## Commit and PR style

- One topic per PR. Multiple unrelated changes get split.
- Commit messages: imperative mood (`add foo`, not `added foo`).
- PR description should explain *why*, not just *what*. A diff already says
  what.

## License for contributions

By contributing you agree your contribution is licensed under the
[MIT license](LICENSE). No CLA is required — PRD §11 noted CLA vs DCO as an
open question; we landed on plain MIT with no extra paperwork.

## How to add a Diagnose rule

1. Pick a kebab-case, descriptive rule ID. Decide its `severity` (`danger`,
   `warning`, or `info`) and `category` (`broker`, `topic`, `producer`,
   `consumer`, `transactions`, `security`, or `performance`).
2. Add the rule to `packages/kafka-diagnose/src/rules.ts` following the existing
   `Rule` pattern. The evaluator receives parsed `.properties` keys and returns
   a finding, an array of findings, or `null` for a clean config. Include
   `learnSlug` when an article explains the concept, plus optional
   `simulateSlug` and `fix` fields when the UI can reproduce or copy a repair.

   ```ts
   {
     id: "retention-ms-too-short",
     category: "topic",
     evaluate(config) {
       const retentionMs = num(config["retention.ms"] ?? config["log.retention.ms"]);
       if (retentionMs === undefined || retentionMs >= 86_400_000) return null;

       return {
         severity: "warning",
         title: "retention.ms is shorter than one day",
         detail:
           "Short retention windows can evict replay data before downstream consumers recover.",
         learnSlug: "log-compaction",
         simulateSlug: "slow-consumer",
         fix: {
           before: `retention.ms=${retentionMs}`,
           after: "retention.ms=86400000",
         },
       };
     },
   },
   ```

3. Add a `node:test` case in `packages/kafka-diagnose/src/diagnose.test.ts`
   with both a triggering config and a non-triggering control.

   ```ts
   test("evaluate: retention-ms-too-short fires only below one day", () => {
     const trigger = evaluate("retention.ms=3600000");
     assert.ok(
       trigger.findings.some((finding) => finding.ruleId === "retention-ms-too-short"),
     );

     const control = evaluate("retention.ms=604800000");
     assert.equal(
       control.findings.some((finding) => finding.ruleId === "retention-ms-too-short"),
       false,
     );
   });
   ```

4. Optional: update the relevant `content/learn/<slug>.mdx` article with a short
   cross-link to the new rule.
5. Run the full check set:

   ```bash
   pnpm test
   pnpm typecheck
   pnpm build
   ```

   The rule auto-appears on `/diagnose` and gets a canonical page at
   `/diagnose/rules/<id>`.

## How to add a Learn article

1. Create `content/learn/<slug>.mdx` with frontmatter. Keep `date` quoted — YAML
   auto-parses unquoted dates into `Date` objects.

   ```mdx
   ---
   title: Backpressure for embedding pipelines
   description: How to keep Kafka-backed embedding jobs bounded and replayable.
   date: "2026-06-01"
   scenarios: ["slow-consumer"]
   ---
   ```

2. Add the slug to `content/learn/meta.json` in the desired sidebar position.
3. Encouraged: add at least one interactive component. Put it in
   `components/demos/<demo>.tsx` as a Client Component.

   ```tsx
   "use client";

   export function EmbeddingBackpressureDemo() {
     return <div className="rounded-xl border p-4">Interactive demo</div>;
   }
   ```

   Import it directly in the MDX when it is article-specific:

   ```mdx
   import { EmbeddingBackpressureDemo } from "@/components/demos/embedding-backpressure-demo";

   <EmbeddingBackpressureDemo />
   ```

   If you want a demo auto-available across articles, register it globally in
   `mdx-components.tsx` when present; in this repo today, globally available
   demos are passed from `app/learn/[[...slug]]/page.tsx`.
4. Encouraged: reference relevant Diagnose rules and Simulate scenarios in the
   body and footer. Add scenario slugs to frontmatter with `scenarios: [...]`.
5. Run `pnpm build`. The article auto-appears in the sidebar, `/rss.xml`, the
   sitemap, and the homepage "Latest articles" list.

## How to add a Simulate scenario

1. Add a `Scenario` object to `packages/kafka-sim/src/scenarios.ts`. Required
   fields are `slug`, `title`, `blurb`, `cluster` (`ClusterOptions`), and
   `script` (`ScenarioOp[]`).

   ```ts
   "rolling-restart": {
     slug: "rolling-restart",
     title: "Rolling restart — one broker at a time",
     blurb: "Restart brokers sequentially while ISR recovers between steps.",
     cluster: {
       brokerCount: 3,
       partitionCount: 3,
       replicationFactor: 3,
       minInsyncReplicas: 2,
       producerAcks: "all",
     },
     script: [
       { kind: "produce", partition: 0, value: "before restart" },
       { kind: "killBroker", brokerId: 0, note: "broker 0 down" },
       { kind: "wait", ticks: 2, note: "ISR stabilizes" },
       { kind: "reviveBroker", brokerId: 0, note: "broker 0 back" },
       { kind: "wait", ticks: 3, note: "broker rejoins ISR" },
     ],
   },
   ```

2. Optional: add `consumerGroup` when the scenario needs a consumer group.

   ```ts
   consumerGroup: {
     id: "orders-indexer",
     consumerIds: ["c-1", "c-2"],
     protocol: "cooperative",
     consumeRatePerTick: 1,
   },
   ```

3. Put the scenario in the order you want it on the picker. `SCENARIO_LIST` is
   currently derived from `Object.values(SCENARIOS)`, so the object insertion
   order in `SCENARIOS` controls display order.
4. Add a `node:test` case in `packages/kafka-sim/src/engine.test.ts` that
   exercises the script's terminal state.

   ```ts
   test("scenario: rolling-restart restores ISR", () => {
     const scenario = SCENARIOS["rolling-restart"];
     let state = createCluster(scenario.cluster);

     for (const op of scenario.script) {
       state = runOp(state, op).state;
     }

     const isr = [...state.topic.partitions[0].isr].sort((a, b) => a - b);
     assert.deepEqual(isr, [0, 1, 2]);
   });
   ```

5. Run `pnpm build`. The scenario auto-appears on `/simulate`, gets an embed
   route at `/simulate/embed/<slug>`, and is included in the sitemap. Cross-link
   from articles by adding the slug to article frontmatter with
   `scenarios: [...]`.
