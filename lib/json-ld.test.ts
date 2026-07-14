import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeJsonLd } from "./json-ld";

test("serializeJsonLd escapes script-closing sequences", () => {
  const serialized = serializeJsonLd({ value: "</script><script>alert(1)</script>" });

  assert.ok(!serialized.includes("</script>"));
  assert.ok(serialized.includes("\\u003c/script>"));
  assert.deepEqual(JSON.parse(serialized), {
    value: "</script><script>alert(1)</script>",
  });
});
