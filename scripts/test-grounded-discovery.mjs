import assert from "node:assert/strict";
import { applyGroundedDiscoveryGate } from "../src/grounded-discovery-wrapper.js";

function basePlan(methods) {
  return {
    selected_mode: "discover",
    session_complete: false,
    methods,
    notice: "old",
    fallback: null
  };
}

{
  const result = applyGroundedDiscoveryGate(basePlan([
    { task_key: "discover:fate-three", title: "FATEを3回", measurable_motive: false },
    { task_key: "discover:bozja-one-set", title: "ボズヤ3回", measurable_motive: false },
    { task_key: "discover:ocean-fishing", title: "16,000点を狙う", measurable_motive: true, progress_metric: "16,000点" }
  ]));
  assert.equal(result.methods.length, 1);
  assert.equal(result.methods[0].task_key, "discover:ocean-fishing");
  assert.equal(result.methods[0].rank, 1);
  assert.equal(result.discovery_evidence_gate, true);
  assert.doesNotMatch(JSON.stringify(result.methods), /fate-three|bozja-one-set/);
}

{
  const result = applyGroundedDiscoveryGate(basePlan([
    { task_key: "journal:test", title: "貼ったジャーナルを進める", source_kind: "journal_screenshot" },
    { task_key: "discover:gold-saucer-gate", title: "GATE", measurable_motive: false }
  ]));
  assert.equal(result.methods.length, 1);
  assert.equal(result.methods[0].source_kind, "journal_screenshot");
}

{
  const result = applyGroundedDiscoveryGate(basePlan([
    { task_key: "discover:fate-three", title: "FATEを3回", measurable_motive: false }
  ]));
  assert.equal(result.methods.length, 0);
  assert.equal(result.now, null);
  assert.match(result.notice, /枠を埋めず|候補不足/);
}

console.log("grounded-discovery OK");
