// Regression tests for shared template helper.
// Run with: deno test supabase/functions/_shared/template_test.ts
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTemplateParams,
  renderTemplateBody,
  resolveTemplateVar,
  validateTemplateForLaunch,
} from "./template.ts";

Deno.test("resolveTemplateVar: empty first var falls back to 'there'", () => {
  assertEquals(resolveTemplateVar("name", 0, ""), "there");
  assertEquals(resolveTemplateVar("name", 0, null), "there");
  assertEquals(resolveTemplateVar("name", 0, undefined), "there");
});

Deno.test("resolveTemplateVar: empty middle var falls back to ' '", () => {
  assertEquals(resolveTemplateVar("city", 1, ""), " ");
  assertEquals(resolveTemplateVar("city", 2, null), " ");
});

Deno.test("resolveTemplateVar: trims and preserves real values", () => {
  assertEquals(resolveTemplateVar("name", 0, "  John  "), "John");
});

Deno.test("buildTemplateParams: length always matches template.variables", () => {
  const tpl = { variables: ["name", "city", "amount"] };
  assertEquals(buildTemplateParams(tpl, {}).length, 3);
  assertEquals(
    buildTemplateParams(tpl, { name: "Alice" }),
    ["Alice", " ", " "],
  );
});

Deno.test("buildTemplateParams: never returns empty string (would trigger #131008)", () => {
  const tpl = { variables: ["name", "city"] };
  const out = buildTemplateParams(tpl, { name: "", city: "" });
  for (const p of out) {
    if (p === "") throw new Error("Empty param leaked through");
  }
  assertEquals(out, ["there", " "]);
});

Deno.test("renderTemplateBody: same fallback as params, ' ' renders as empty", () => {
  const body = "Hi {{1}}, your city is {{2}}.";
  const out = renderTemplateBody(body, ["name", "city"], { name: "", city: "" });
  assertEquals(out, "Hi there, your city is .");
});

Deno.test("renderTemplateBody: real values pass through", () => {
  const body = "Hi {{1}}!";
  assertEquals(
    renderTemplateBody(body, ["name"], { name: "Bob" }),
    "Hi Bob!",
  );
});

Deno.test("validateTemplateForLaunch: rejects mismatched placeholder count", () => {
  assertThrows(() =>
    validateTemplateForLaunch(
      { name: "tpl", body: "Hi {{1}} from {{2}}", variables: ["name"] },
      [{ variables: { name: "x" } }],
    )
  );
});

Deno.test("validateTemplateForLaunch: hard-fails when middle var empty for all", () => {
  assertThrows(() =>
    validateTemplateForLaunch(
      { name: "tpl", body: "Hi {{1}} from {{2}}", variables: ["name", "city"] },
      Array.from({ length: 100 }, () => ({ variables: { name: "x", city: "" } })),
    )
  );
});

Deno.test("validateTemplateForLaunch: soft-warns when all names empty", () => {
  const { warnings } = validateTemplateForLaunch(
    { name: "tpl", body: "Hi {{1}}", variables: ["name"] },
    Array.from({ length: 10 }, () => ({ variables: { name: "" } })),
  );
  if (warnings.length === 0) throw new Error("expected warning");
});

Deno.test("validateTemplateForLaunch: passes clean data", () => {
  const { warnings } = validateTemplateForLaunch(
    { name: "tpl", body: "Hi {{1}} from {{2}}", variables: ["name", "city"] },
    [
      { variables: { name: "A", city: "NYC" } },
      { variables: { name: "B", city: "LA" } },
    ],
  );
  assertEquals(warnings.length, 0);
});
