import { startSystemPage } from "./system-page.js";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const id = new URLSearchParams(window.location.search).get("id");
await startSystemPage(async (request, isCurrent) => {
  el("pageTitle").textContent = id ? "モデル修正" : "モデル登録";
  if (id) {
    const model = await request(`/${encodeURIComponent(id)}`);
    if (!isCurrent()) return;
    el("provider").value = model.provider;
    el("modelName").value = model.model_name;
    el("enabled").value = String(model.enabled);
  }
  el("saveButton").disabled = false;
  el("modelForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || el("saveButton").disabled || !el("modelForm").reportValidity()) return;
    const name = el("modelName").value.trim();
    if (!name) { showError(new Error("モデル名を入力してください。")); return; }
    el("saveButton").disabled = true;
    try {
      await request(id ? `/${encodeURIComponent(id)}` : "", { method: id ? "PUT" : "POST", body: JSON.stringify({ provider: el("provider").value, model_name: name, enabled: el("enabled").value === "true" }) });
      if (isCurrent()) window.location.replace("system_models.html");
    } catch (error) { if (isCurrent()) { showError(error); el("saveButton").disabled = false; } }
  };
});
