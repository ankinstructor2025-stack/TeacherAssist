export function setupPromptEditor(data, request, path, isCurrent, custom = false) {
  const el = id => document.getElementById(id);
  const text = el("promptText");
  const save = el("saveButton");
  let draft = data.prompt_text || "";
  let usingCommon = custom && data.use_common;
  el("fixedRules").textContent = data.fixed_rules;
  function render() {
    text.value = usingCommon ? data.common_prompt_text : draft;
    text.readOnly = Boolean(usingCommon);
    text.maxLength = custom ? 4000 : 12000;
    el("promptLabel").textContent = custom ? usingCommon ? "共通指導方針（参照）" : "追加の指導方針" : "共通指導方針";
  }
  if (custom) {
    el("useCommonPrompt").checked = Boolean(usingCommon);
    el("useCommonPrompt").onchange = () => {
      if (!usingCommon) draft = text.value;
      usingCommon = el("useCommonPrompt").checked;
      render();
    };
  }
  render();
  save.disabled = false;
  el("promptForm").onsubmit = async event => {
    event.preventDefault();
    if (!isCurrent() || save.disabled) return;
    const value = usingCommon ? "" : text.value.trim();
    if ((!usingCommon && !value) || value.length > (custom ? 4000 : 12000)) {
      el("message").textContent = "指導方針を入力してください。利用者設定を解除する場合は共通設定に戻してください。";
      return;
    }
    save.disabled = true;
    text.readOnly = true;
    if (custom) el("useCommonPrompt").disabled = true;
    try {
      await request(path, { method: "PUT", body: JSON.stringify({ prompt_text: value }) });
      if (isCurrent()) {
        el("message").textContent = "保存しました。次回のAI提案から反映されます。";
        if (!usingCommon) draft = value;
      }
    } catch (error) { if (isCurrent()) el("message").textContent = error.message || "保存できませんでした。"; }
    finally {
      if (isCurrent()) {
        save.disabled = false;
        if (custom) el("useCommonPrompt").disabled = false;
        text.readOnly = Boolean(usingCommon);
      }
    }
  };
}
