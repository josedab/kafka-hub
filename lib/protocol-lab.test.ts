import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PROTOCOL_LABS,
  PROTOCOL_LAB_SLUGS,
  REVIEWED_AGAINST_TEXT,
  findProtocolLab,
  isProtocolLabSlug,
} from "./protocol-lab";

describe("Protocol Lab: registry", () => {
  it("has exactly five labs, one per slug", () => {
    assert.equal(PROTOCOL_LABS.length, 5);
    assert.equal(PROTOCOL_LABS.length, PROTOCOL_LAB_SLUGS.length);
  });

  it("lab slugs are unique and match the authoritative slug list", () => {
    const slugs = PROTOCOL_LABS.map((lab) => lab.slug);
    assert.equal(new Set(slugs).size, slugs.length, "Duplicate lab slugs");
    assert.deepEqual([...slugs].sort(), [...PROTOCOL_LAB_SLUGS].sort());
  });

  it("findProtocolLab resolves every known slug and rejects unknown ones", () => {
    for (const slug of PROTOCOL_LAB_SLUGS) {
      assert.ok(findProtocolLab(slug), `Expected a lab for slug ${slug}`);
    }
    assert.equal(findProtocolLab("does-not-exist"), undefined);
  });

  it("isProtocolLabSlug narrows correctly", () => {
    for (const slug of PROTOCOL_LAB_SLUGS) {
      assert.equal(isProtocolLabSlug(slug), true);
    }
    assert.equal(isProtocolLabSlug("not-a-real-lab"), false);
  });

  it("every lab exposes the exact required Kafka baseline text", () => {
    assert.equal(REVIEWED_AGAINST_TEXT, "Reviewed against Apache Kafka 4.3.1");
  });
});

describe("Protocol Lab: determinism", () => {
  it("lab definitions contain no runtime randomness or clock reads", () => {
    const labFiles = [
      "produce-record.ts",
      "consumer-group.ts",
      "share-groups.ts",
      "transactions.ts",
      "replication-failover.ts",
    ];
    const nondeterministicCalls =
      /\b(?:Date\.now|new\s+Date|Math\.random|crypto\.randomUUID)\s*\(/;

    for (const file of labFiles) {
      const source = readFileSync(
        new URL(`./protocol-lab/labs/${file}`, import.meta.url),
        "utf8",
      );
      assert.doesNotMatch(
        source,
        nondeterministicCalls,
        `${file}: Protocol Lab definitions must remain deterministic`,
      );
    }
  });

  it("every variant has at least one step, and step IDs are unique within a variant", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const variant of lab.variants) {
        assert.ok(variant.steps.length > 0, `${lab.slug}/${variant.id} has no steps`);
        const ids = variant.steps.map((step) => step.id);
        assert.equal(
          new Set(ids).size,
          ids.length,
          `${lab.slug}/${variant.id} has duplicate step IDs`,
        );
      }
    }
  });

  it("variant IDs are unique within a lab", () => {
    for (const lab of PROTOCOL_LABS) {
      const ids = lab.variants.map((v) => v.id);
      assert.equal(new Set(ids).size, ids.length, `${lab.slug} has duplicate variant IDs`);
    }
  });

  it("every step references actors that exist on the lab", () => {
    for (const lab of PROTOCOL_LABS) {
      const actorIds = new Set(lab.actors.map((a) => a.id));
      for (const variant of lab.variants) {
        for (const step of variant.steps) {
          assert.ok(
            actorIds.has(step.fromActorId),
            `${lab.slug}/${variant.id}/${step.id}: unknown fromActorId ${step.fromActorId}`,
          );
          assert.ok(
            actorIds.has(step.toActorId),
            `${lab.slug}/${variant.id}/${step.id}: unknown toActorId ${step.toActorId}`,
          );
        }
      }
    }
  });

  it("actor IDs are unique within a lab", () => {
    for (const lab of PROTOCOL_LABS) {
      const ids = lab.actors.map((a) => a.id);
      assert.equal(new Set(ids).size, ids.length, `${lab.slug} has duplicate actor IDs`);
    }
  });

  it("wire frames are internally consistent: hexBytes and hexLabels stay parallel", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const variant of lab.variants) {
        for (const step of variant.steps) {
          for (const frame of step.frames ?? []) {
            assert.equal(
              frame.hexBytes.length,
              frame.hexLabels.length,
              `${lab.slug}/${variant.id}/${step.id}: hexBytes/hexLabels length mismatch for ${frame.apiName}`,
            );
            assert.ok(Number.isInteger(frame.apiKey) && frame.apiKey >= 0);
            assert.ok(Number.isInteger(frame.apiVersion) && frame.apiVersion >= 0);
            assert.ok(Number.isInteger(frame.correlationId) && frame.correlationId >= 0);
            assert.ok(["request", "response"].includes(frame.kind));
          }
        }
      }
    }
  });

  it("a single-frame step's frame kind agrees with the step direction", () => {
    // Some steps deliberately bundle a request+response pair (e.g. a
    // steady-state heartbeat) into one step for narrative brevity — those
    // carry two frames and are exempt. A step with exactly one frame must
    // agree with its own direction.
    for (const lab of PROTOCOL_LABS) {
      for (const variant of lab.variants) {
        for (const step of variant.steps) {
          if (step.direction !== "request" && step.direction !== "response") continue;
          if ((step.frames ?? []).length !== 1) continue;
          const [frame] = step.frames ?? [];
          assert.equal(
            frame.kind,
            step.direction,
            `${lab.slug}/${variant.id}/${step.id}: frame.kind (${frame.kind}) does not match step.direction (${step.direction})`,
          );
        }
      }
    }
  });

  it("internal steps carry no wire frames", () => {
    for (const lab of PROTOCOL_LABS) {
      for (const variant of lab.variants) {
        for (const step of variant.steps) {
          if (step.direction === "internal") {
            assert.ok(
              !step.frames || step.frames.length === 0,
              `${lab.slug}/${variant.id}/${step.id}: internal step unexpectedly carries frames`,
            );
          }
        }
      }
    }
  });

  it("error frames carry the correct Kafka error code/name pair", () => {
    const kafkaErrors = new Map([
      [6, "NOT_LEADER_OR_FOLLOWER"],
      [27, "REBALANCE_IN_PROGRESS"],
      [47, "INVALID_PRODUCER_EPOCH"],
      [74, "FENCED_LEADER_EPOCH"],
    ]);

    for (const lab of PROTOCOL_LABS) {
      for (const variant of lab.variants) {
        for (const step of variant.steps) {
          for (const frame of step.frames ?? []) {
            if (frame.errorCode !== undefined && frame.errorCode !== 0) {
              assert.equal(
                frame.errorName,
                kafkaErrors.get(frame.errorCode),
                `${lab.slug}/${variant.id}/${step.id}: incorrect Kafka error code/name pair`,
              );
            }
          }
        }
      }
    }
  });
});
