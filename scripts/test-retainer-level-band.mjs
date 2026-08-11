import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildRetainerTaskSearchUrl,
  parseRetainerTaskResults,
  retainerJobCode
} from "../src/retainer-level-band.js";
import { sanitizeRetainerWorkflowAnalysis } from "../src/retainer-workflow-image.js";

assert.equal(retainerJobCode("戦士"), "WAR");
assert.equal(retainerJobCode("採掘師"), "MIN");
assert.equal(retainerJobCode("園芸師"), "BTN");
assert.equal(retainerJobCode("漁師"), "FSH");
assert.equal(retainerJobCode("RDM"), "RDM");
assert.equal(retainerJobCode("不明"), null);
assert.equal(retainerJobCode("feather icon"), null, "generic icon labels are not usable job identities");

const url = new URL(buildRetainerTaskSearchUrl("WAR", 92));
assert.equal(url.hostname, "v2.xivapi.com");
assert.equal(url.searchParams.get("sheets"), "RetainerTask");
assert.match(url.searchParams.get("query"), /IsRandom=false/);
assert.match(url.searchParams.get("query"), /ClassJobCategory\.WAR=true/);
assert.match(url.searchParams.get("query"), /RetainerLevel<=92/);
assert.match(url.searchParams.get("fields"), /Task\.Item@as\(raw\)/);
assert.match(url.searchParams.get("fields"), /Task\.Item\.Name/);

const parsed = parseRetainerTaskResults({
  results: [
    {
      fields: {
        RetainerLevel: 90,
        "MaxTime{min}": 60,
        Task: {
          fields: {
            "Item@as(raw)": 1234,
            Item: { fields: { Name: "テスト素材" } },
            Quantity: [10, 15, 20, 25, 30]
          }
        }
      }
    },
    {
      fields: {
        RetainerLevel: 91,
        "MaxTime{min}": 60,
        Task: {
          fields: {
            "Item@as(raw)": 1234,
            Item: { fields: { Name: "テスト素材" } },
            Quantity: [20, 20, 20, 20, 20]
          }
        }
      }
    }
  ]
}, { retainer_name: "テスト", job_name: "戦士", level: 92 });
assert.equal(parsed.length, 1, "same item must be deduped");
assert.equal(parsed[0].item_id, 1234);
assert.equal(parsed[0].item_name, "テスト素材");
assert.equal(parsed[0].quantity, 10, "use the conservative minimum positive quantity tier");
assert.equal(parsed[0].venture_level, 90);
assert.equal(parsed[0].retainer_level, 92);

const overview = sanitizeRetainerWorkflowAnalysis({
  screen_type: "retainer_overview",
  confidence: 0.94,
  retainers: [
    { retainer_name: "A", job_name: "戦士", level: 92, confidence: 0.95 },
    { retainer_name: "B", job_name: "採掘師", level: 87, confidence: 0.91 }
  ],
  retainer_name: null,
  job_name: null,
  level: null,
  ventures: []
}, "test-model");
assert.equal(overview.page_type, "retainer_overview");
assert.equal(overview.retainer_overview.retainers.length, 2);
assert.equal(overview.retainer_overview.retainers[1].level, 87);

const workflowSource = readFileSync(new URL("../src/retainer-workflow-image.js", import.meta.url), "utf8");
const wrapperSource = readFileSync(new URL("../src/retainer-level-band-wrapper.js", import.meta.url), "utf8");
const iconWrapperSource = readFileSync(new URL("../src/retainer-icon-hotfix-wrapper.js", import.meta.url), "utf8");
const recoverySource = readFileSync(new URL("../src/task-board-recovery-wrapper.js", import.meta.url), "utf8");
const inboxSource = readFileSync(new URL("../public/context-inbox-core.js", import.meta.url), "utf8");
const inboxEntrySource = readFileSync(new URL("../public/context-inbox.js", import.meta.url), "utf8");
const dailySource = readFileSync(new URL("../public/task-board-daily-checks.js", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
assert.doesNotMatch(workflowSource, /responseJsonSchema/, "retainer overview must stay JSON-mode only");
assert.match(workflowSource, /この一覧だけで十分/);
assert.match(wrapperSource, /fetchRetainerLevelBandCandidates/);
assert.match(wrapperSource, /retainer_level_band/);
assert.match(wrapperSource, /market_attempted/);
assert.match(wrapperSource, /market_checked/);
assert.match(wrapperSource, /MAX_RECOMMENDATIONS = 2/);
assert.match(wrapperSource, /市場比較は実行していません/);
assert.match(iconWrapperSource, /hasUsableOverview/);
assert.match(iconWrapperSource, /retainerJobCode\(row\?\.job_name\)/);
assert.match(recoverySource, /retainer-level-band-wrapper\.js/);
assert.match(inboxSource, /リテイナー一覧（名前・ジョブ\/クラス・Lvが見える画面）/);
assert.match(inboxEntrySource, /task-board-daily-checks\.js/);
assert.match(appSource, /dailyLeveling/);
assert.match(appSource, /dailyAlliance/);
assert.match(dailySource, /dailyChecklist/);
assert.match(dailySource, /今日の戦闘日課/);
assert.doesNotMatch(dailySource, /MutationObserver/);

console.log("retainer overview level-band and task-board daily checks: ok");
