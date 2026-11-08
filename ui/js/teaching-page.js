import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";
import { mountSchoolToolbar } from "./school-toolbar.js?v=20261108-4";

export async function startTeachingPage(title, toolbar, onReady) {
  const el = id => document.getElementById(id);
  const updateToolbar = mountSchoolToolbar(title, toolbar);
  try {
    const { auth } = await initializeAuth();
    el("logoutButton").onclick = async () => {
      try { await signOut(auth); window.location.replace("../index.html"); } catch (error) { showError(error); }
    };
    onAuthStateChanged(auth, async user => {
      el("content").hidden = true;
      updateToolbar({});
      if (!user) { window.location.replace("../index.html"); return; }
      const isCurrent = () => auth.currentUser === user;
      async function request(path, settings = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, { ...settings, cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "担当科目を取得・保存できませんでした。"), { status: response.status });
        return data;
      }
      try {
        const session = await loadSession(user);
        if (!isCurrent()) return;
        if (session.is_system_administrator) { window.location.replace("system_menu.html"); return; }
        const data = await request("/teaching-assignments");
        if (!isCurrent()) return;
        updateToolbar(data.profile);
        await onReady(data, request, isCurrent);
        if (!isCurrent()) return;
        el("status").textContent = "";
        el("content").hidden = false;
      } catch (error) {
        if (!isCurrent()) return;
        el("status").textContent = "担当科目を表示できませんでした。";
        showError(error);
        if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
      }
    }, showError);
  } catch (error) { showError(error); }
}
