const INPUT_ID = "huntBillFileInput";

function prepareInput(input) {
  input.id = INPUT_ID;
  input.hidden = false;
  input.setAttribute("aria-hidden", "true");
  Object.assign(input.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: "0",
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0, 0, 0, 0)",
    whiteSpace: "nowrap",
    border: "0"
  });
}

function upgradeNativePicker() {
  const root = document.getElementById("huntSection");
  if (!root) return false;

  const input = root.querySelector("[data-hunt-file]");
  const trigger = root.querySelector("[data-hunt-file-open]");
  if (!input || !trigger) return false;

  prepareInput(input);
  if (trigger instanceof HTMLLabelElement && trigger.htmlFor === INPUT_ID) return true;

  const label = document.createElement("label");
  label.className = trigger.className || "hunt-upload";
  label.htmlFor = INPUT_ID;
  label.dataset.huntFileOpen = "native";
  label.textContent = trigger.textContent || "手配書スクショを追加";
  label.setAttribute("role", "button");
  label.tabIndex = 0;
  label.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    input.click();
  });
  trigger.replaceWith(label);
  return true;
}

function boot() {
  if (upgradeNativePicker()) return;
  const observer = new MutationObserver(() => {
    if (!upgradeNativePicker()) return;
    observer.disconnect();
  });
  observer.observe(document.documentElement, { subtree: true, childList: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
