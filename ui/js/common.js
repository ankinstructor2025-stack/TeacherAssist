import { API_BASE_URL } from "./config.js";

export async function loadSession(user) {
  const token = await user.getIdToken();
  const response = await fetch(`${API_BASE_URL}/session`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const error = new Error(typeof detail.detail === "string" ? detail.detail : response.status === 401 ? "ログインの有効期限が切れました。再度ログインしてください。" : "ログイン情報を確認できませんでした。時間をおいて再試行してください。");
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function showError(error) {
  document.getElementById("error").textContent = error.message || "処理に失敗しました。";
}
