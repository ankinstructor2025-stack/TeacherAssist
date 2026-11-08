import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";
import { renderInstructionLinks } from "./instruction-links.js";

const el = id => document.getElementById(id);
const add = document.createElement("a");
add.className = "btn btn-primary";
add.href = "teaching_subject_edit.html";
add.textContent = "新規登録";
add.hidden = true;

await startTeachingPage("担当科目", { buttons: [add] }, async (data, request, isCurrent) => {
  add.hidden = !data.profile.school_code;
  el("profileNotice").hidden = Boolean(data.profile.school_code);
  el("subjectList").replaceChildren();
  for (const assignment of data.assignments) {
    const row = document.createElement("tr");
    for (const text of [`${assignment.grade}年`, assignment.subject, assignment.textbook]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    const materials = document.createElement("div");
    materials.className = "instruction-links";
    renderInstructionLinks(materials, assignment.instruction_materials || []);
    row.children[2].append(materials);
    const actions = document.createElement("td");
    const edit = document.createElement("a");
    edit.className = "btn";
    edit.href = `teaching_subject_edit.html?id=${encodeURIComponent(assignment.id)}`;
    edit.textContent = "修正";
    edit.setAttribute("aria-label", `${assignment.grade}年 ${assignment.subject}を修正`);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn";
    remove.textContent = "削除";
    remove.setAttribute("aria-label", `${assignment.grade}年 ${assignment.subject}を削除`);
    remove.onclick = async () => {
      const warning = assignment.has_lesson_plans ? "この担当科目の指導案も開けなくなります。" : "";
      if (!isCurrent() || !window.confirm(`${assignment.grade}年 ${assignment.subject}を削除しますか？${warning}`)) return;
      remove.disabled = true;
      try {
        await request(`/teaching-assignments/${encodeURIComponent(assignment.id)}`, { method: "DELETE" });
        if (isCurrent()) window.location.reload();
      } catch (error) { if (isCurrent()) { showError(error); remove.disabled = false; } }
    };
    const plans = document.createElement("a");
    plans.className = "btn btn-primary";
    plans.href = `lesson_plans.html?assignment=${encodeURIComponent(assignment.id)}`;
    plans.textContent = "指導案";
    actions.className = "row-actions";
    actions.append(edit, remove, plans);
    row.append(actions);
    el("subjectList").append(row);
  }
  el("listStatus").textContent = data.assignments.length
    ? `${data.assignments.length}件の担当科目を表示しています。`
    : data.profile.school_code ? "担当科目はまだ登録されていません。「新規登録」から登録してください。" : "";
});
