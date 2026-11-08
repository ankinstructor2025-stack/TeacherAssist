import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const assignment = new URLSearchParams(window.location.search).get("assignment");
const add = document.createElement("a");
add.className = "btn btn-primary";
add.textContent = "新規登録";
add.href = `lesson_plan_edit.html?assignment=${encodeURIComponent(assignment || "")}`;
add.hidden = true;

await startTeachingPage("指導案一覧", { buttons: [add], backHref: "teaching_subjects.html", backLabel: "担当科目に戻る" }, async (data, request, isCurrent) => {
  add.hidden = false;
  el("lessonContext").textContent = `${data.assignment.grade}年 ／ ${data.assignment.subject} ／ ${data.assignment.textbook}`;
  el("lessonPlanList").replaceChildren();
  for (const plan of data.plans) {
    const row = document.createElement("tr");
    for (const value of [plan.title, plan.unit, `${plan.hours}時間`]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    const actions = document.createElement("td");
    actions.className = "row-actions";
    const edit = document.createElement("a");
    edit.className = "btn";
    edit.href = `lesson_plan_edit.html?assignment=${encodeURIComponent(assignment)}&id=${encodeURIComponent(plan.id)}`;
    edit.textContent = "修正";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn";
    remove.textContent = "削除";
    remove.onclick = async () => {
      if (!isCurrent() || !window.confirm(`指導案「${plan.title}」を削除しますか？`)) return;
      remove.disabled = true;
      try {
        await request(`/teaching-assignments/${encodeURIComponent(assignment)}/lesson-plans/${encodeURIComponent(plan.id)}`, { method: "DELETE" });
        if (isCurrent()) window.location.reload();
      } catch (error) { if (isCurrent()) { showError(error); remove.disabled = false; } }
    };
    actions.append(edit, remove);
    row.append(actions);
    el("lessonPlanList").append(row);
  }
  el("listStatus").textContent = data.plans.length ? `${data.plans.length}件の指導案を表示しています。` : "指導案はまだありません。「新規登録」から作成してください。";
}, `/teaching-assignments/${encodeURIComponent(assignment || "")}/lesson-plans`);
