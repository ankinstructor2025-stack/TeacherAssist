import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";

const el = id => document.getElementById(id);
const prefecture = el("prefecture");
const city = el("city");
const school = el("school");
const save = el("saveProfileButton");
function options(select, items, placeholder, value = "") {
  select.replaceChildren(new Option(placeholder, ""));
  for (const item of items) select.add(new Option(item.label, item.value));
  select.value = value;
  select.disabled = !items.length;
}
try {
  const { auth } = await initializeAuth();
  el("logoutButton").onclick = async () => {
    try { await signOut(auth); window.location.replace("../index.html"); } catch (error) { showError(error); }
  };
  onAuthStateChanged(auth, async user => {
    el("content").hidden = true;
    if (!user) { window.location.replace("../index.html"); return; }
    let revision = 0;
    async function request(path, settings = {}) {
      const response = await fetch(`${API_BASE_URL}${path}`, { ...settings, cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "プロフィールを取得・保存できませんでした。"), { status: response.status });
      return data;
    }
    function resetSchool() { options(school, [], "先に市区町村を選択してください"); save.disabled = true; }
    async function loadCities(selected = "") {
      const currentRevision = ++revision;
      options(city, [], "市区町村を読み込み中…"); resetSchool();
      if (!prefecture.value) { options(city, [], "先に都道府県を選択してください"); return; }
      const data = await request(`/schools?prefecture=${encodeURIComponent(prefecture.value)}`);
      if (currentRevision !== revision || auth.currentUser !== user) return;
      options(city, data.cities.map(value => ({ value, label: value })), "市区町村を選択してください", selected);
    }
    async function loadSchools(selected = "") {
      const currentRevision = ++revision;
      resetSchool();
      if (!city.value) return;
      const data = await request(`/schools?prefecture=${encodeURIComponent(prefecture.value)}&city=${encodeURIComponent(city.value)}`);
      if (currentRevision !== revision || auth.currentUser !== user) return;
      options(school, data.schools.map(record => ({ value: record.code, label: record.name })), "学校を選択してください", selected);
      save.disabled = !school.value;
    }
    try {
      const session = await loadSession(user);
      if (auth.currentUser !== user) return;
      if (session.is_system_administrator) { window.location.replace("system_menu.html"); return; }
      el("userName").textContent = session.name || session.email;
      el("userEmail").textContent = session.email;
      const [catalog, result] = await Promise.all([request("/schools"), request("/profile")]);
      if (auth.currentUser !== user) return;
      const profile = result.profile;
      options(prefecture, catalog.prefectures.map(value => ({ value, label: value })), "都道府県を選択してください", profile.prefecture || "");
      if (prefecture.value) await loadCities(profile.city || "");
      if (city.value) await loadSchools(profile.school_code || "");
      prefecture.onchange = () => { el("status").textContent = ""; loadCities().catch(showError); };
      city.onchange = () => { el("status").textContent = ""; loadSchools().catch(showError); };
      school.onchange = () => { save.disabled = !school.value; el("status").textContent = ""; };
      el("profileForm").onsubmit = async event => {
        event.preventDefault();
        if (!el("profileForm").reportValidity() || !school.value) return;
        save.disabled = true;
        prefecture.disabled = city.disabled = school.disabled = true;
        try {
          await request("/profile", { method: "PUT", body: JSON.stringify({ school_code: school.value }) });
          el("error").textContent = ""; el("status").textContent = "プロフィールを登録しました。";
        } catch (error) { showError(error); }
        finally { prefecture.disabled = city.disabled = school.disabled = false; save.disabled = !school.value; }
      };
      if (auth.currentUser !== user) return;
      el("status").textContent = profile.school_code && !school.value ? "以前登録した学校が現在の一覧にありません。学校を選択し直してください。" : "";
      el("content").hidden = false;
    } catch (error) {
      el("status").textContent = "プロフィールを取得できませんでした。";
      showError(error);
      if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
    }
  }, showError);
} catch (error) { showError(error); }
