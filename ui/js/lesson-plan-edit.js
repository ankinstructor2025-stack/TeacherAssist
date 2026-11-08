import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const assignment = params.get("assignment") || "";
const id = params.get("id");
const endpoint = `/teaching-assignments/${encodeURIComponent(assignment)}/lesson-plans`;
const back = `lesson_plans.html?assignment=${encodeURIComponent(assignment)}`;
const save = document.createElement("button");
save.type = "submit";
save.className = "btn btn-primary";
save.textContent = "保存";
save.setAttribute("form", "lessonPlanForm");
save.disabled = true;

await startTeachingPage(id ? "指導案修正" : "指導案作成", { buttons: [save], backHref: back, backLabel: "一覧に戻る" }, async (data, request, isCurrent) => {
  el("lessonContext").textContent = `${data.assignment.grade}年 ／ ${data.assignment.subject} ／ ${data.assignment.textbook}`;
  el("contentsList").replaceChildren();
  for (const book of data.contents) {
    const heading = document.createElement("h3");
    heading.textContent = book.title;
    const source = document.createElement("a");
    source.textContent = book.source_label;
    if (book.source_url.startsWith("https://")) source.href = book.source_url;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    el("contentsList").append(heading, source);
    const units = document.createElement("div");
    for (const unit of book.units) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = unit;
      button.onclick = () => {
        el("unit").value = `${book.title} ／ ${unit}`;
        if (!el("planTitle").value) el("planTitle").value = unit;
      };
      units.append(button);
    }
    el("contentsList").append(units);
  }
  el("contentsStatus").textContent = data.contents.length ? "項目を押すと単元・教材名に反映します。" : "この教科書の目次は未対応です。単元・教材名を直接入力して作成できます。";
  const fields = { title: "planTitle", unit: "unit", hours: "hours", objectives: "objectives", activities: "activities", assessment: "assessment", notes: "notes" };
  if (id) {
    const plan = data.plans.find(item => item.id === id);
    if (!plan) throw new Error("指導案が見つかりません。一覧に戻って選び直してください。");
    for (const [key, field] of Object.entries(fields)) el(field).value = plan[key] ?? "";
  }
  save.disabled = false;
  el("lessonPlanForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || save.disabled || !el("lessonPlanForm").reportValidity()) return;
    const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, key === "hours" ? Number(el(field).value) : el(field).value]));
    body.grade = data.assignment.grade;
    body.subject = data.assignment.subject;
    save.disabled = true;
    try {
      await request(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
      if (isCurrent()) window.location.replace(back);
    } catch (error) { if (isCurrent()) { showError(error); save.disabled = false; } }
  };
}, endpoint);
