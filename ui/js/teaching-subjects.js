import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";
import { mountSchoolToolbar } from "./school-toolbar.js";
import { renderTextbookRows } from "./textbook-list.js";

const el = id => document.getElementById(id);
const updateToolbar = mountSchoolToolbar("担当科目");
for (let grade = 1; grade <= 6; grade++) el("grade").add(new Option(`${grade}年`, String(grade)));
const subjects = ["国語", "書写", "社会", "地図", "算数", "理科", "生活", "音楽", "図画工作", "家庭", "保健", "英語", "道徳"];
for (const subject of subjects) el("subject").add(new Option(subject, subject));

function render(data) {
  const grade = Number(el("grade").value);
  const subject = el("subject").value;
  const selected = Boolean(grade && subject && data.profile.school_code);
  const rows = selected ? data.textbooks.filter(book => book.grades.includes(grade) && book.subject === subject) : [];
  renderTextbookRows(el("subjectList"), rows, grade);
  el("textbookResult").hidden = !selected || !rows.length;
  el("profileNotice").hidden = Boolean(data.profile.school_code);
  el("grade").disabled = el("subject").disabled = !data.profile.school_code;
  el("listStatus").textContent = !data.profile.school_code ? "" : !selected
    ? "学年と科目を選択すると、この学校で採択している教科書を表示します。"
    : !data.covered
    ? "この学校の公開採択情報はまだ連携されていません。"
    : rows.length ? `${rows.length}件の採択教科書を表示しています。` : "選択した学年・科目の採択情報はありません。";
}

try {
  const { auth } = await initializeAuth();
  el("logoutButton").onclick = async () => {
    try { await signOut(auth); window.location.replace("../index.html"); } catch (error) { showError(error); }
  };
  onAuthStateChanged(auth, async user => {
    el("content").hidden = true;
    updateToolbar({});
    el("subjectList").replaceChildren();
    if (!user) { window.location.replace("../index.html"); return; }
    try {
      const session = await loadSession(user);
      if (auth.currentUser !== user) return;
      if (session.is_system_administrator) { window.location.replace("system_menu.html"); return; }
      const response = await fetch(`${API_BASE_URL}/teaching-subjects`, { cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "担当科目を取得できませんでした。"), { status: response.status });
      if (auth.currentUser !== user) return;
      updateToolbar(data.profile);
      render(data);
      el("grade").onchange = el("subject").onchange = () => render(data);
      el("status").textContent = "";
      el("error").textContent = "";
      el("content").hidden = false;
    } catch (error) {
      if (auth.currentUser !== user) return;
      el("status").textContent = "担当科目を取得できませんでした。";
      showError(error);
      if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
    }
  }, showError);
} catch (error) { showError(error); }
