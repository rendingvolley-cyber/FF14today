import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const entry = readFileSync(new URL("../src/hunt-entry.js", import.meta.url), "utf8");
const service = readFileSync(new URL("../src/hunt-service.js", import.meta.url), "utf8");
const ui = readFileSync(new URL("../public/hunt-section.js", import.meta.url), "utf8");

assert.equal(wrangler.main, "src/hunt-entry.js", "hunt wrapper must remain the deployed Worker entrypoint");
assert.match(entry, /import app from "\.\/gc-top3-entry\.js"/, "hunt integration must wrap, not replace, the existing production entry");
assert.match(entry, /\/api\/hunts\/today/);
assert.match(entry, /\/api\/hunts\/recognize/);
assert.match(entry, /\/api\/hunts\/progress/);
assert.match(entry, /\/api\/hunts\/complete-all/);
assert.match(entry, /augmentPlanWithHunts/);
assert.match(entry, /hunt-section\.js/);
assert.match(entry, /daily_hunt_task_board_bridge:\s*true/);

assert.match(service, /CREATE TABLE IF NOT EXISTS daily_hunt_targets/);
assert.match(service, /CREATE TABLE IF NOT EXISTS daily_hunt_image_cache/);
assert.match(service, /responseJsonSchema:\s*recognitionSchema\(\)/);
assert.match(service, /ゲーム知識でモブ名・エリア・座標・報酬を推測してはいけません/);
assert.match(service, /verification_status TEXT NOT NULL DEFAULT 'image_read'/);
assert.match(service, /selected_mode !== "efficient"/);
assert.match(service, /source_kind:\s*"hunt_daily"/);
assert.match(service, /モブ手配書をまとめて回る/);
assert.match(service, /\[existing\[0\], hunt, \.\.\.existing\.slice\(1\)\]\.slice\(0, 3\)/, "hunt task must stay visible in the combat top-three without replacing #1");

assert.match(ui, /id = "huntSection"/);
assert.match(ui, /TODAY'S HUNT/);
assert.match(ui, /手配書スクショを追加/);
assert.match(ui, /ここを選んで Ctrl\+V/);
assert.match(ui, /data-hunt-target/);
assert.match(ui, /\+1討伐/);
assert.match(ui, /今日分をすべて完了/);
assert.match(ui, /\/api\/hunts\/recognize/);
assert.match(ui, /\/api\/hunts\/progress/);
assert.match(ui, /data-open-hunt/);
assert.match(ui, /MutationObserver\(decorateTaskBoard\)/);

console.log("Daily hunt section MVP wiring OK");
