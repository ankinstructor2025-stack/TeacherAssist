import { startSystemPage } from "./system-page.js";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const providers = { openai: "OpenAI", gemini: "Gemini", takane: "Takane" };
await startSystemPage(async (request, isCurrent) => {
  async function load() {
    const data = await request();
    if (!isCurrent()) return;
    el("modelList").replaceChildren();
    for (const model of data.models) {
      const row = document.createElement("tr");
      for (const value of [providers[model.provider] || model.provider, model.model_name, model.enabled ? "有効" : "無効"]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      const actions = document.createElement("td");
      actions.className = "row-actions";
      const edit = document.createElement("a");
      edit.className = "btn";
      edit.href = `system_model_edit.html?id=${encodeURIComponent(model.id)}`;
      edit.textContent = "修正";
      const remove = document.createElement("button");
      remove.className = "btn";
      remove.type = "button";
      remove.textContent = "削除";
      remove.onclick = async () => {
        if (!isCurrent() || !window.confirm(`モデル「${model.model_name}」を削除しますか？`)) return;
        remove.disabled = true;
        try { await request(`/${encodeURIComponent(model.id)}`, { method: "DELETE" }); await load(); }
        catch (error) { if (isCurrent()) { showError(error); remove.disabled = false; } }
      };
      actions.append(edit, remove);
      row.append(actions);
      el("modelList").append(row);
    }
    el("listStatus").textContent = data.models.length ? `${data.models.length}件のモデルを表示しています。` : "モデルはまだ登録されていません。";
  }
  await load();
});
