import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { showError } from "./common.js";

const el = id => document.getElementById(id);
const params = new URLSearchParams(window.location.search);
const assignment = params.get("assignment") || "";
const id = params.get("id");
const endpoint = `/teaching-assignments/${encodeURIComponent(assignment)}/homework`;
const back = `homework.html?assignment=${encodeURIComponent(assignment)}`;
const save = document.createElement("button");
save.type = "submit"; save.className = "btn btn-primary"; save.textContent = "保存";
save.setAttribute("form", "homeworkForm"); save.disabled = true;

await startTeachingPage(id ? "宿題修正" : "宿題作成", { buttons: [save], backHref: back, backLabel: "一覧に戻る" }, async (data, request, isCurrent) => {
  const levelFields = ["beginner", "intermediate", "advanced"].flatMap(level => [`${level}_questions`, `${level}_answers`]);
  const fields = { title: "homeworkTitle", unit: "unit", minutes: "minutes", ...Object.fromEntries(levelFields.map(key => [key, key])) };
  let busy = false;
  const generate = el("generateHomeworkButton");
  el("homeworkContext").textContent = `${data.assignment.grade}年 ／ ${data.assignment.subject} ／ ${data.assignment.textbook}`;
  el("unitOptions").replaceChildren();
  for (const book of data.contents) for (const unit of book.units) el("unitOptions").append(new Option(unit, `${book.title} ／ ${unit}`));
  if (id) {
    const item = data.homework.find(item => item.id === id);
    if (!item) throw new Error("宿題が見つかりません。一覧から選び直してください。");
    for (const [key, field] of Object.entries(fields)) el(field).value = item[key] ?? "";
    el("homeworkCreatedAt").textContent = item.created_at ? `作成日：${new Date(item.created_at).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}` : "作成済み";
  }
  function setBusy(value) {
    busy = value; generate.disabled = save.disabled = value;
    for (const field of Object.values(fields)) el(field).disabled = value;
    generate.textContent = value ? "作成中…" : "宿題を自動作成";
  }
  setBusy(false);
  generate.onclick = async () => {
    if (!isCurrent() || busy) return;
    const unit = el("unit").value.trim();
    const minutes = Number(el("minutes").value);
    if (!unit || !Number.isInteger(minutes) || minutes < 5 || minutes > 60) { el("generationStatus").textContent = "単元と5〜60分の目安時間を入力してください。"; return; }
    if (levelFields.some(key => el(key).value.trim()) && !window.confirm("入力済みの問題・解答をAIの提案で置き換えますか？")) return;
    setBusy(true); el("generationStatus").textContent = "初級・中級・上級の宿題を作成しています…";
    try {
      const result = await request(`${endpoint}/suggest`, { method: "POST", body: JSON.stringify({ grade: data.assignment.grade, subject: data.assignment.subject, unit, minutes }) });
      if (!isCurrent()) return;
      for (const key of ["title", ...levelFields]) el(fields[key]).value = result.suggestion[key];
      el("generationStatus").textContent = "3段階の宿題を作成しました。問題と解答を確認・修正して保存してください。";
    } catch (error) { if (isCurrent()) el("generationStatus").textContent = error.message || "宿題の作成に失敗しました。"; }
    finally { if (isCurrent()) setBusy(false); }
  };
  el("homeworkForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || busy || !el("homeworkForm").reportValidity()) return;
    const body = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, key === "minutes" ? Number(el(field).value) : el(field).value]));
    body.grade = data.assignment.grade; body.subject = data.assignment.subject;
    setBusy(true);
    try {
      await request(id ? `${endpoint}/${encodeURIComponent(id)}` : endpoint, { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
      if (isCurrent()) window.location.replace(back);
    } catch (error) { if (isCurrent()) { showError(error); setBusy(false); } }
  };
}, endpoint);
