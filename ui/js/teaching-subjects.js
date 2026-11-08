import { startTeachingPage } from "./teaching-page.js?v=20261108-5";

const el = id => document.getElementById(id);
const add = document.createElement("a");
add.className = "btn btn-primary";
add.href = "teaching_subject_edit.html";
add.textContent = "新規登録";
add.hidden = true;

await startTeachingPage("担当科目", { buttons: [add] }, async data => {
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
    const actions = document.createElement("td");
    const edit = document.createElement("a");
    edit.className = "btn";
    edit.href = `teaching_subject_edit.html?id=${encodeURIComponent(assignment.id)}`;
    edit.textContent = "編集";
    edit.setAttribute("aria-label", `${assignment.grade}年 ${assignment.subject}を編集`);
    actions.append(edit);
    row.append(actions);
    el("subjectList").append(row);
  }
  el("listStatus").textContent = data.assignments.length
    ? `${data.assignments.length}件の担当科目を表示しています。`
    : data.profile.school_code ? "担当科目はまだ登録されていません。「新規登録」から登録してください。" : "";
});
