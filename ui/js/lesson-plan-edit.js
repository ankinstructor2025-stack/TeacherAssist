import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const assignment = params.get("assignment") || "";
const id = params.get("id");
let currentId = id;
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
  const fields = { title: "planTitle", unit: "unit", hours: "hours", objectives: "objectives", activities: "activities", assessment: "assessment", notes: "notes" };
  const unitButtons = [];
  const snapshot = () => JSON.stringify(Object.values(fields).map(field => String(el(field).value)));
  let baseline;
  function createdLabel(plan) {
    if (!plan) return "未作成";
    const date = plan.created_at ? new Date(plan.created_at) : null;
    return date && !Number.isNaN(date.getTime())
      ? `作成日：${new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date)}`
      : "作成済み（作成日不明）";
  }
  function loadPlan(plan, unit = "", title = "") {
    currentId = plan?.id || null;
    for (const [key, field] of Object.entries(fields)) el(field).value = plan?.[key] ?? (key === "hours" ? 1 : "");
    if (!plan) { el("unit").value = unit; el("planTitle").value = title; }
    el("planCreatedAt").textContent = createdLabel(plan);
    for (const item of unitButtons) item.button.setAttribute("aria-pressed", String(item.unit === el("unit").value));
    baseline = snapshot();
  }
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
    units.className = "lesson-unit-list";
    for (const unit of book.units) {
      const unitKey = `${book.title} ／ ${unit}`;
      const plans = data.plans.filter(plan => plan.unit === unitKey);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "lesson-unit";
      const label = document.createElement("span");
      label.textContent = unit;
      const date = document.createElement("span");
      date.className = "lesson-unit-date";
      date.textContent = plans.length ? [...new Set(plans.map(createdLabel))].join("、") : "未作成";
      button.append(label, date);
      button.onclick = () => {
        if (baseline !== snapshot() && !window.confirm("保存していない変更があります。単元を切り替えますか？")) return;
        loadPlan(plans[0], unitKey, unit);
      };
      unitButtons.push({ button, unit: unitKey });
      units.append(button);
    }
    el("contentsList").append(units);
  }
  el("contentsStatus").textContent = data.contents.length ? "単元を選ぶと右側で指導案を作成・修正できます。" : "この教科書の目次は未対応です。単元・教材名を直接入力して作成できます。";
  if (id) {
    const plan = data.plans.find(item => item.id === id);
    if (!plan) throw new Error("指導案が見つかりません。一覧に戻って選び直してください。");
    loadPlan(plan);
  } else loadPlan(null);
  save.disabled = false;
  el("lessonPlanForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || save.disabled || !el("lessonPlanForm").reportValidity()) return;
    const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, key === "hours" ? Number(el(field).value) : el(field).value]));
    body.grade = data.assignment.grade;
    body.subject = data.assignment.subject;
    save.disabled = true;
    try {
      await request(currentId ? `${endpoint}/${encodeURIComponent(currentId)}` : endpoint, { method: currentId ? "PUT" : "POST", body: JSON.stringify(body) });
      if (isCurrent()) window.location.replace(back);
    } catch (error) { if (isCurrent()) { showError(error); save.disabled = false; } }
  };
}, endpoint);
