import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const wrapper = await readFile(new URL("../src/gc-jsonmode-wrapper.js", import.meta.url), "utf8");
const statusUi = await readFile(new URL("../public/gc-item-name-status.js", import.meta.url), "utf8");

assert.match(wrapper, /validateGrandCompanySupplyDutyDeliveries/);
assert.match(wrapper, /loadCurrentJobs/);
assert.match(wrapper, /gc_supply_level_validation:\s*true/);
assert.match(wrapper, /gc_supply_level_source:\s*"XIVAPI GCSupplyDuty"/);
assert.match(wrapper, /chooseGrandCompanyDelivery\(verified\)/);
assert.match(statusUi, /レベル帯未照合/);
assert.match(statusUi, /誤った品名は確定表示していません/);

console.log("GC supply-duty delivery wiring: ok");
