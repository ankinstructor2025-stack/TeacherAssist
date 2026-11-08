const el = id => document.getElementById(id);

export function resetProfileAi() {
  el("profileAi").hidden = true;
  el("aiApiKey").value = "";
  el("aiApiKey").type = "password";
  el("aiApiKey").disabled = true;
  el("aiModel").replaceChildren(new Option("モデルを選択してください", ""));
  el("aiModel").disabled = true;
  el("toggleAiKey").textContent = "表示";
  el("testAiButton").disabled = el("saveAiButton").disabled = true;
  el("aiTestResult").textContent = "";
}

export async function setupProfileAi(request, isCurrent) {
  const model = el("aiModel");
  const key = el("aiApiKey");
  const save = el("saveAiButton");
  const test = el("testAiButton");
  el("profileAi").hidden = false;
  el("aiStatus").textContent = "API設定を読み込んでいます…";
  try {
    const data = await request("/profile/ai");
    if (!isCurrent()) return;
    let saved = data.settings;
    let selectedProvider = saved.provider;
    let busy = false;
    const names = { openai: "OpenAI", gemini: "Gemini", takane: "Takane" };
    model.replaceChildren(new Option("モデルを選択してください", ""));
    for (const item of data.models) model.add(new Option(`${names[item.provider] || item.provider} ／ ${item.model_name}`, item.id));
    if (saved.model_id && !data.models.some(item => item.id === saved.model_id)) {
      const option = new Option(`${saved.model_name}（利用不可）`, saved.model_id);
      option.disabled = true;
      model.add(option);
    }
    model.value = saved.model_id || "";
    key.value = saved.api_key || "";
    function update() {
      const available = data.models.some(item => item.id === model.value);
      const dirty = model.value !== saved.model_id || Boolean(key.value.trim() && key.value.trim() !== saved.api_key);
      save.disabled = busy || !available;
      test.disabled = busy || !available || !saved.has_api_key || dirty;
      model.disabled = busy || !data.models.length;
      key.disabled = busy;
      key.placeholder = saved.has_api_key ? "登録済み（変更する場合のみ入力）" : "APIキーを入力してください";
    }
    function changed() { el("aiTestResult").textContent = ""; el("aiStatus").textContent = "変更した設定は保存してから疎通テストしてください。"; update(); }
    key.oninput = changed;
    model.onchange = () => {
      const provider = data.models.find(item => item.id === model.value)?.provider;
      if (provider !== selectedProvider) {
        key.value = provider === saved.provider ? saved.api_key || "" : "";
        key.type = "password";
        el("toggleAiKey").textContent = "表示";
      }
      selectedProvider = provider;
      changed();
    };
    el("toggleAiKey").onclick = () => {
      key.type = key.type === "password" ? "text" : "password";
      el("toggleAiKey").textContent = key.type === "password" ? "表示" : "非表示";
    };
    el("aiSettingsForm").onsubmit = async event => {
      event.preventDefault();
      if (!isCurrent() || save.disabled || !el("aiSettingsForm").reportValidity()) return;
      busy = true;
      update();
      el("aiStatus").textContent = "API設定を保存しています…";
      el("aiTestResult").textContent = "";
      try {
        const submittedKey = key.value.trim();
        const result = await request("/profile/ai", { method: "PUT", body: JSON.stringify({ model_id: model.value, api_key: submittedKey || null }) });
        if (!isCurrent()) return;
        saved = { ...result.settings, api_key: submittedKey || saved.api_key || "" };
        selectedProvider = saved.provider;
        key.value = saved.api_key;
        key.type = "password";
        el("toggleAiKey").textContent = "表示";
        el("aiStatus").textContent = "API設定を保存しました。";
      } catch (error) { if (isCurrent()) el("aiStatus").textContent = error.message || "API設定を保存できませんでした。"; }
      finally { if (isCurrent()) { busy = false; update(); } }
    };
    test.onclick = async () => {
      if (!isCurrent() || test.disabled) return;
      busy = true;
      update();
      el("aiTestResult").textContent = "疎通テスト中…";
      try {
        const result = await request("/profile/ai/test", { method: "POST" });
        if (isCurrent()) el("aiTestResult").textContent = result.message;
      } catch (error) { if (isCurrent()) el("aiTestResult").textContent = error.message || "疎通テストに失敗しました。"; }
      finally { if (isCurrent()) { busy = false; update(); } }
    };
    el("aiStatus").textContent = !data.models.length ? "利用可能なモデルがありません。管理者にモデルの登録を依頼してください。"
      : saved.has_api_key ? "APIキーは登録済みです。保存した設定で疎通テストできます。" : "モデルを選び、APIキーを保存してください。";
    update();
  } catch (error) {
    if (isCurrent()) el("aiStatus").textContent = error.message || "API設定を読み込めませんでした。";
  }
}
