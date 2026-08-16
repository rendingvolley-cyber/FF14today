import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { activateNowLayout, correctedPreparationRange } from "../public/task-board-schedule-correction.js";
import { buildAbsoluteTiming, countdownState, isBigFishCandidate } from "../public/time-sensitive-dashboard.js";

assert.equal(correctedPreparationRange("18:20–18:26"), "18:13–18:20");
assert.equal(correctedPreparationRange("00:03–00:09"), "23:56–00:03");
assert.equal(correctedPreparationRange("09:30-09:36", 5), "09:25–09:30");
assert.equal(correctedPreparationRange("時刻確認"), null);

const classes = new Set();
const root = { body: { classList: { add: value => classes.add(value) } } };
assert.equal(activateNowLayout(root), true);
assert.equal(classes.has("task-board-now-active"), true);

const source = readFileSync(new URL("../public/task-board-schedule-correction.js", import.meta.url), "utf8");
assert.match(source, /body\.task-board-primary:not\(\.task-board-now-active\) #nowPanel/);
assert.match(source, /body\.task-board-primary\.task-board-now-active #nowPanel \.method-alternative/);
assert.match(source, /\.task-now-button/);
assert.doesNotMatch(source, /MutationObserver/);

const presentationSource = readFileSync(new URL("../public/task-board-no-schedule.js", import.meta.url), "utf8");
assert.match(presentationSource, /\.task-board-schedule\{display:none!important\}/);
assert.match(presentationSource, /category !== "craft"/);
assert.match(presentationSource, /data-craft-only-hidden/);
assert.match(presentationSource, /visibleCandidateCount/);
assert.match(presentationSource, /#taskBoardGrid \.task-select-card/);
assert.match(presentationSource, /#taskBoardTimedList \.timed-task/);
assert.match(presentationSource, /MutationObserver/);

const base = Date.parse("2026-08-13T18:00:00+09:00");
const upcoming = buildAbsoluteTiming({ time_window: { starts_in_minutes: 7, duration_minutes: 6 } }, base);
assert.equal(upcoming.startAt, base + 7 * 60000);
assert.equal(upcoming.endAt, base + 13 * 60000);
assert.equal(countdownState(upcoming, base).label, "あと7分");
assert.equal(countdownState(upcoming, base + 8 * 60000).state, "open");
assert.equal(countdownState(upcoming, base + 8 * 60000).label, "いま · 残り5分");

const deadline = buildAbsoluteTiming({ title: "期間限定イベント 終了まで 90分" }, base);
assert.equal(countdownState(deadline, base).label, "残り1時間30分");
assert.equal(isBigFishCandidate({ job_code: "FSH", title: "オオヌシを狙う" }), true);
assert.equal(isBigFishCandidate({ job_code: "FSH", title: "普通の魚を釣る" }), false);

const dashboardSource = readFileSync(new URL("../public/time-sensitive-dashboard.js", import.meta.url), "utf8");
assert.match(dashboardSource, /BIG FISH/);
assert.match(dashboardSource, /期限・時限/);
assert.match(dashboardSource, /data-category=\"event\"/);
assert.match(dashboardSource, /data-category=\"weekly\"/);
assert.match(dashboardSource, /#taskBoard \.task-board-timed/);
assert.match(dashboardSource, /REFRESH_INTERVAL_MS = 10 \* 60 \* 1000/);
assert.match(dashboardSource, /VISIBLE_TICK_MS = 1000/);

console.log("task board presentation, separate time-sensitive dashboard, and live countdowns: ok");
