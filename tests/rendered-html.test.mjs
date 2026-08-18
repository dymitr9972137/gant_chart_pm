import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("ships the generic project tracker", () => {
  assert.match(page, /Scopeboard/);
  assert.match(page, /PLAN-101/);
  assert.match(page, /Gantt/);
  assert.match(page, /exportTimelineToExcel/);
  assert.match(page, /exportTimelineToPdf/);
});

test("does not contain customer-specific sample data", () => {
  assert.doesNotMatch(page, /customer-ticket-prefix|confidential-client-name/i);
});
