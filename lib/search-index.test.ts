import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createSearchAPI } from "fumadocs-core/search/server";
import { buildSearchIndexes } from "./search-index";

const indexes = buildSearchIndexes();
const search = createSearchAPI("simple", { indexes });

describe("unified search index", () => {
  test("has unique, complete records", () => {
    assert.ok(indexes.length > 0);
    assert.equal(new Set(indexes.map((index) => index.url)).size, indexes.length);

    for (const index of indexes) {
      assert.ok(index.title.trim(), `${index.url}: missing title`);
      assert.ok(index.description !== undefined, `${index.url}: missing description`);
      assert.ok(index.content.trim(), `${index.url}: missing searchable content`);
      assert.ok(index.url.startsWith("/"), `${index.url}: expected local URL`);
      assert.ok(index.breadcrumbs?.length, `${index.url}: missing breadcrumbs`);
    }
  });

  test("covers every required surface", () => {
    const urls = indexes.map((index) => index.url);
    const requiredPrefixes = [
      "/learn",
      "/notes/",
      "/runbooks/",
      "/diagnose/rules/",
      "/errors/",
      "/kips#",
      "/learn/cheatsheet/",
      "/simulate?scenario=",
      "/workbench/",
    ];

    for (const prefix of requiredPrefixes) {
      assert.ok(
        urls.some((url) => url.startsWith(prefix)),
        `missing search surface: ${prefix}`,
      );
    }
  });

  test("indexes Learn, Field Notes, and Runbook body text, not only metadata", () => {
    const rebalance = indexes.find(
      (index) => index.url === "/learn/consumer-rebalance",
    );
    const brokerRunbook = indexes.find(
      (index) => index.url === "/runbooks/broker-wont-restart",
    );
    const fieldNote = indexes.find(
      (index) => index.url === "/notes/kafka-4-3-for-operators",
    );

    assert.match(rebalance?.content ?? "", /JoinGroup/i);
    assert.match(brokerRunbook?.content ?? "", /log director|log\.dirs|storage/i);
    assert.match(fieldNote?.content ?? "", /cordon|KIP-1066/i);
  });

  test("known queries return the expected surfaces through Fumadocs", async () => {
    const cases = [
      ["KIP-848", "/kips#kip-848"],
      ["NotEnoughReplicasException", "/errors/not-enough-replicas-exception"],
      ["JoinGroup", "/learn/consumer-rebalance"],
      ["KRaft transition", "/workbench/kraft"],
      ["listener topology", "/workbench/listeners"],
      ["consumer lag", "/workbench/lag"],
      ["cordoned log directories", "/notes/kafka-4-3-for-operators"],
    ] as const;

    for (const [query, expectedUrl] of cases) {
      const results = await search.search(query, { limit: 20 });
      assert.ok(
        results.some((result) => result.url === expectedUrl),
        `"${query}" did not return ${expectedUrl}; got ${results
          .map((result) => result.url)
          .join(", ")}`,
      );
    }
  });
});
