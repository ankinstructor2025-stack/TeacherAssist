import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";

const content = document.getElementById("content");
const status = document.getElementById("status");
const errorBox = document.getElementById("error");

try {
  const { auth } = await initializeAuth();
  document.getElementById("logoutButton").onclick = async () => {
    try { await signOut(auth); location.replace("../index.html"); } catch (error) { showError(error); }
  };
  onAuthStateChanged(auth, async user => {
    content.hidden = true;
    if (!user) { location.replace("../index.html"); return; }
    try {
      const session = await loadSession(user);
      if (auth.currentUser !== user) return;
      if (!session.is_system_administrator) { location.replace("home.html"); return; }
      async function request(path = "", options = {}) {
        const response = await fetch(`${API_BASE_URL}/system/users${path}`, {
          ...options, cache: "no-store",
          headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "処理に失敗しました。"), { status: response.status });
        return data;
      }
      const list = document.getElementById("userList");
      if (list) {
        const form = document.getElementById("userForm");
        const name = document.getElementById("userName");
        const email = document.getElementById("email");
        const save = document.getElementById("saveButton");
        let editingId = null;
        function openEditor(record = null) {
          editingId = record?.id || null;
          name.value = record?.user_name || "";
          email.value = record?.email || "";
          document.getElementById("formTitle").textContent = record ? "ユーザー編集" : "ユーザー登録";
          errorBox.textContent = "";
          form.hidden = false; name.focus();
        }
        document.getElementById("addUserButton").onclick = () => openEditor();
        document.getElementById("cancelButton").onclick = () => { form.hidden = true; };
        async function load() {
          const data = await request();
          if (auth.currentUser !== user) return;
          list.replaceChildren();
          if (!data.users.length) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = 3; cell.textContent = "ユーザーが登録されていません。"; row.append(cell); list.append(row); return; }
          for (const record of data.users) {
            const row = document.createElement("tr");
            const userNameCell = document.createElement("td"); userNameCell.textContent = record.user_name;
            const emailCell = document.createElement("td"); emailCell.textContent = record.email;
            const actions = document.createElement("td");
            const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn"; edit.textContent = "編集";
            edit.onclick = () => openEditor(record);
            const remove = document.createElement("button"); remove.type = "button"; remove.className = "btn"; remove.textContent = "削除";
            remove.onclick = async () => {
              if (!confirm(`${record.user_name}（${record.email}）を削除しますか？削除後はログインできなくなります。`)) return;
              remove.disabled = true;
              try {
                await request(`/${encodeURIComponent(record.id)}`, { method: "DELETE" });
                if (editingId === record.id) form.hidden = true;
                errorBox.textContent = ""; status.textContent = "削除しました。"; await load();
              } catch (error) { showError(error); } finally { remove.disabled = false; }
            };
            actions.append(edit, remove); row.append(userNameCell, emailCell, actions); list.append(row);
          }
        }
        form.onsubmit = async event => {
          event.preventDefault();
          if (!form.reportValidity()) return;
          save.disabled = true;
          try {
            await request(editingId ? `/${encodeURIComponent(editingId)}` : "", {
              method: editingId ? "PUT" : "POST", body: JSON.stringify({ user_name: name.value.trim(), email: email.value.trim() })
            });
            form.hidden = true; errorBox.textContent = ""; status.textContent = "保存しました。"; await load();
          } catch (error) { showError(error); } finally { save.disabled = false; }
        };
        await load();
      }
      if (auth.currentUser === user) { content.hidden = false; status.textContent = ""; }
    } catch (error) {
      if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
      status.textContent = "情報を取得できませんでした。"; showError(error);
    }
  }, showError);
} catch (error) { showError(error); }
