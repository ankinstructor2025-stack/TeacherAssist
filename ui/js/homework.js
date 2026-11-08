import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const assignment = new URLSearchParams(window.location.search).get("assignment") || "";
const endpoint = `/teaching-assignments/${encodeURIComponent(assignment)}/homework`;
const add = document.createElement("a");
add.className = "btn btn-primary";
add.textContent = "新規作成";
add.href = `homework_edit.html?assignment=${encodeURIComponent(assignment)}`;
add.hidden = true;
await startTeachingPage("宿題一覧", { buttons: [add], backHref: "teaching_subjects.html", backLabel: "担当科目に戻る" }, async (data, request, isCurrent) => {
  add.hidden = false;
  el("homeworkContext").textContent = `${data.assignment.grade}年 ／ ${data.assignment.subject} ／ ${data.assignment.textbook}`;
  el("homeworkList").replaceChildren();
  for (const item of data.homework) {
    const row = document.createElement("tr");
    for (const text of [item.title, item.unit, item.created_at ? new Date(item.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : "作成日不明"]) {
      const cell = document.createElement("td"); cell.textContent = text; row.append(cell);
    }
    const actions = document.createElement("td");
    actions.className = "row-actions";
    const edit = document.createElement("a");
    edit.className = "btn"; edit.textContent = "修正";
    edit.href = `homework_edit.html?assignment=${encodeURIComponent(assignment)}&id=${encodeURIComponent(item.id)}`;
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "btn"; remove.textContent = "削除";
    remove.onclick = async () => {
      if (!isCurrent() || !window.confirm(`宿題「${item.title}」を削除しますか？`)) return;
      remove.disabled = true;
      try { await request(`${endpoint}/${encodeURIComponent(item.id)}`, { method: "DELETE" }); if (isCurrent()) window.location.reload(); }
      catch (error) { if (isCurrent()) { showError(error); remove.disabled = false; } }
    };
    actions.append(edit, remove); row.append(actions); el("homeworkList").append(row);
  }
  el("listStatus").textContent = data.homework.length ? `${data.homework.length}件の宿題を表示しています。` : "宿題はまだありません。「新規作成」から作成してください。";
}, endpoint);
