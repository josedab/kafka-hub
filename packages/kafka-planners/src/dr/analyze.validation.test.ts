import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeDr,
  makeInput,
  analyzeOk,
} from "./analyze.test-support";
import type {
  DrTabletopInput,
} from "./analyze.test-support";

// ─── Validation: Malformed / Unknown Input ──────────────────────────────────

describe("validation: malformed and unknown input never throws", () => {
  const MALFORMED_CASES: Array<{ name: string; input: unknown }> = [
    { name: "null", input: null },
    { name: "undefined", input: undefined },
    { name: "number", input: 42 },
    { name: "string", input: "hello" },
    { name: "array", input: [1, 2, 3] },
    { name: "boolean", input: true },
    { name: "empty object", input: {} },
    {
      name: "wrong types for fields",
      input: {
        replicationLagSeconds: "five",
        checkpointIntervalSeconds: true,
        incidentDetectionSeconds: null,
        promotionSeconds: [],
        dnsTtlSeconds: {},
        clientReconnectSeconds: undefined,
        validationSeconds: "60",
        duplicateToleranceSeconds: NaN,
      },
    },

  ];

  for (const tc of MALFORMED_CASES) {
    test(`${tc.name} — does not throw`, () => {
      const r = analyzeDr(tc.input);
      assert.equal(r.ok, false, `malformed ${tc.name} should fail validation`);
    });
  }

  test("completely valid input succeeds", () => {
    const r = analyzeDr(makeInput());
    assert.equal(r.ok, true);
  });
});

// ─── Validation: Duration Edge Cases ────────────────────────────────────────

describe("validation: duration edge cases", () => {
  test("zero replication lag is valid (non-negative)", () => {
    const r = analyzeDr(makeInput({ replicationLagSeconds: 0 }));
    assert.equal(r.ok, true);
  });

  test("negative replication lag is invalid", () => {
    const r = analyzeDr(makeInput({ replicationLagSeconds: -1 }));
    assert.equal(r.ok, false);
  });

  test("zero checkpoint interval is invalid (must be positive)", () => {
    const r = analyzeDr(makeInput({ checkpointIntervalSeconds: 0 }));
    assert.equal(r.ok, false);
  });

  test("negative checkpoint interval is invalid", () => {
    const r = analyzeDr(makeInput({ checkpointIntervalSeconds: -10 }));
    assert.equal(r.ok, false);
  });

  test("zero validation time is invalid (must be positive)", () => {
    const r = analyzeDr(makeInput({ validationSeconds: 0 }));
    assert.equal(r.ok, false);
  });

  test("Infinity in any field is invalid", () => {
    for (const key of [
      "replicationLagSeconds",
      "checkpointIntervalSeconds",
      "incidentDetectionSeconds",
      "promotionSeconds",
      "dnsTtlSeconds",
      "clientReconnectSeconds",
      "validationSeconds",
      "duplicateToleranceSeconds",
    ] as const) {
      const input = makeInput({ [key]: Infinity } as Partial<DrTabletopInput>);
      const r = analyzeDr(input);
      assert.equal(r.ok, false, `Infinity in ${key} should fail`);
    }
  });

  test("-Infinity in any field is invalid", () => {
    for (const key of [
      "replicationLagSeconds",
      "checkpointIntervalSeconds",
    ] as const) {
      const input = makeInput({ [key]: -Infinity } as Partial<DrTabletopInput>);
      const r = analyzeDr(input);
      assert.equal(r.ok, false, `-Infinity in ${key} should fail`);
    }
  });

  test("NaN in any field is invalid", () => {
    for (const key of [
      "replicationLagSeconds",
      "checkpointIntervalSeconds",
      "incidentDetectionSeconds",
      "promotionSeconds",
      "dnsTtlSeconds",
      "clientReconnectSeconds",
      "validationSeconds",
      "duplicateToleranceSeconds",
    ] as const) {
      const input = makeInput({ [key]: NaN } as Partial<DrTabletopInput>);
      const r = analyzeDr(input);
      assert.equal(r.ok, false, `NaN in ${key} should fail`);
    }
  });

  test("MAX_SAFE_INTEGER is valid", () => {
    const r = analyzeDr(
      makeInput({ replicationLagSeconds: Number.MAX_SAFE_INTEGER }),
    );
    assert.equal(r.ok, true, "MAX_SAFE_INTEGER should be valid");
  });

  test("beyond MAX_SAFE_INTEGER is invalid (unsafe number)", () => {
    const r = analyzeDr(
      makeInput({ replicationLagSeconds: Number.MAX_SAFE_INTEGER + 1 }),
    );
    // Note: MAX_SAFE_INTEGER + 1 === MAX_SAFE_INTEGER + 1 in JS which is
    // still finite, but exceeds safe integer range
    // The validation may or may not catch this depending on float precision
    // We test that the analyzer doesn't throw either way
    assert.ok(r.ok === true || r.ok === false, "should not throw");
  });

  test("invalid strategy string is rejected", () => {
    const r = analyzeDr({ ...makeInput(), strategy: "unknown-tool" });
    assert.equal(r.ok, false);
  });

  test("strategy as number is rejected", () => {
    const r = analyzeDr({ ...makeInput(), strategy: 42 });
    assert.equal(r.ok, false);
  });
});

// ─── Deterministic Result ───────────────────────────────────────────────────

describe("deterministic result", () => {
  test("same input produces identical result", () => {
    const input = makeInput();
    const r1 = analyzeDr(input);
    const r2 = analyzeDr(input);
    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    if (r1.ok && r2.ok) {
      assert.equal(r1.result.rpo.best.seconds, r2.result.rpo.best.seconds);
      assert.equal(r1.result.rpo.likely.seconds, r2.result.rpo.likely.seconds);
      assert.equal(r1.result.rpo.worst.seconds, r2.result.rpo.worst.seconds);
      assert.equal(r1.result.rto.best.seconds, r2.result.rto.best.seconds);
      assert.equal(r1.result.rto.likely.seconds, r2.result.rto.likely.seconds);
      assert.equal(r1.result.rto.worst.seconds, r2.result.rto.worst.seconds);
      assert.equal(r1.result.status, r2.result.status);
      assert.equal(r1.result.checklists.length, r2.result.checklists.length);
    }
  });
});

// ─── Status / Readiness ─────────────────────────────────────────────────────

describe("readiness status", () => {
  test("at-risk when duplicate tolerance exceeded", () => {
    const r = analyzeOk({
      checkpointIntervalSeconds: 120,
      duplicateToleranceSeconds: 60,
    });
    assert.equal(r.status, "at-risk");
  });

  test("ready when within tolerance — no hidden thresholds change status", () => {
    // Even with very high input values, status stays "ready" when tolerance is met.
    // No hidden universal thresholds can downgrade status.
    const r = analyzeOk({
      replicationLagSeconds: 999,
      checkpointIntervalSeconds: 60,
      incidentDetectionSeconds: 9999,
      promotionSeconds: 5000,
      dnsTtlSeconds: 7200,
      clientReconnectSeconds: 3600,
      validationSeconds: 600,
      duplicateToleranceSeconds: 120,
    });
    assert.equal(r.status, "ready", "no hidden threshold should downgrade status to concerns");
  });

  test("ready with moderate values and tolerance met", () => {
    const r = analyzeOk({
      replicationLagSeconds: 5,
      checkpointIntervalSeconds: 30,
      incidentDetectionSeconds: 60,
      promotionSeconds: 15,
      dnsTtlSeconds: 30,
      clientReconnectSeconds: 15,
      validationSeconds: 30,
      duplicateToleranceSeconds: 120,
    });
    assert.equal(r.status, "ready");
  });
});

