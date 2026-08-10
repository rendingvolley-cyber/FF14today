import assert from "node:assert/strict";
import { tribeGuideForJob } from "../public/tribe-leveling-data.js";

const pixie = tribeGuideForJob({ code: "DRG", role: "melee", level: 70 });
assert.equal(pixie.id, "pixie");
assert.match(pixie.first_step, /夢と現の狭間で/);
assert.match(pixie.first_step, /X:13\.1 Y:15\.3/);

const arkasodara = tribeGuideForJob({ code: "SCH", role: "healer", level: 81 });
assert.equal(arkasodara.id, "arkasodara");
assert.match(arkasodara.first_step, /アジムステップの若き冒険者/);
assert.ok(arkasodara.steps.some(step => /錬金術師と赤ん坊/.test(step)));
assert.ok(arkasodara.steps.some(step => /爆走ヒッポ、島を駆る/.test(step)));

const pelupelu = tribeGuideForJob({ code: "RDM", role: "caster", level: 92 });
assert.equal(pelupelu.id, "pelupelu");
assert.match(pelupelu.first_step, /新事業！ トラル旅行公司/);
assert.match(pelupelu.first_step, /X:13\.6 Y:12\.9/);

assert.equal(tribeGuideForJob({ code: "BLU", role: "limited", level: 70 }), null);
assert.equal(tribeGuideForJob({ code: "WAR", role: "tank", level: 100 }), null);
assert.equal(tribeGuideForJob({ code: "ALC", role: "crafter", level: 90 }), null);

console.log("tribe leveling guide rules OK");
