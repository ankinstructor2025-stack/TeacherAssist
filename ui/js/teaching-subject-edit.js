import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const id = new URLSearchParams(window.location.search).get("id");
const save = document.createElement("button");
save.id = "saveAssignmentButton";
save.className = "btn btn-primary";
save.type = "submit";
save.setAttribute("form", "assignmentForm");
save.textContent = "保存";
save.disabled = true;
for (let grade = 1; grade <= 6; grade++) el("grade").add(new Option(`${grade}年`, String(grade)));
for (const subject of ["国語", "書写", "社会", "地図", "算数", "理科", "生活", "音楽", "図画工作", "家庭", "保健", "英語", "道徳"]) {
  el("subject").add(new Option(subject, subject));
}

await startTeachingPage(id ? "担当科目修正" : "担当科目登録", { backHref: "teaching_subjects.html", backLabel: "一覧に戻る", buttons: [save] }, async (data, request, isCurrent) => {
  const hasSchool = Boolean(data.profile.school_code);
  el("profileNotice").hidden = hasSchool;
  el("grade").disabled = el("subject").disabled = !hasSchool;
  if (id) {
    const assignment = data.assignments.find(item => item.id === id);
    if (!assignment) throw new Error("担当科目が見つかりません。一覧に戻って選び直してください。");
    el("grade").value = String(assignment.grade);
    el("subject").value = assignment.subject;
  }
  function updateTextbook() {
    const grade = Number(el("grade").value);
    const subject = el("subject").value;
    const books = data.textbooks.filter(book => book.grades.includes(grade) && book.subject === subject);
    save.disabled = !hasSchool || !books.length;
    el("textbook").textContent = !grade || !subject ? "学年と科目を選択してください。"
      : books.length ? books.map(book => [book.title, book.publisher].filter(Boolean).join(" ／ ")).join("、")
      : !data.covered ? "この学校の公開採択情報はまだ連携されていません。" : "この学年・科目の採択教科書はありません。";
  }
  el("grade").onchange = el("subject").onchange = updateTextbook;
  updateTextbook();
  el("assignmentForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || save.disabled || !el("assignmentForm").reportValidity()) return;
    save.disabled = true;
    el("grade").disabled = el("subject").disabled = true;
    try {
      await request(id ? `/teaching-assignments/${encodeURIComponent(id)}` : "/teaching-assignments", {
        method: id ? "PUT" : "POST", body: JSON.stringify({ grade: Number(el("grade").value), subject: el("subject").value })
      });
      if (isCurrent()) window.location.replace("teaching_subjects.html");
    } catch (error) {
      if (isCurrent()) { showError(error); updateTextbook(); el("grade").disabled = el("subject").disabled = !hasSchool; }
    }
  };
});
