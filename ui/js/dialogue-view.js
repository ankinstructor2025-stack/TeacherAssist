// Preserve the saved text; format a separate reading view using text nodes only.
export function mountDialogueView(input, preview, toggle, getSources = () => []) {
  let editing = false;
  function render() {
    preview.replaceChildren();
    const text = input.value.trim();
    const parts = text.split(/(?=(?:時間|場面|先生|児童|教師|確かめる問い|参考)\s*[：:]|AI補足)/u);
    let card;
    let partNumber = 0;
    let hasSpeech = false;
    for (let part of parts) {
      if (!part.trim()) continue;
      const match = part.match(/^(時間|場面|先生|児童|教師|確かめる問い|参考)\s*[：:]\s*/u);
      const label = match?.[1] || (part.startsWith("AI補足") ? "AI補足" : "");
      const body = match ? part.slice(match[0].length).trim() : part.trim();
      if (!card || label === "時間" || (label === "場面" && hasSpeech)) {
        card = document.createElement("article"); card.className = "dialogue-card";
        const heading = document.createElement("h3"); heading.className = "dialogue-part-heading";
        heading.textContent = `パート ${++partNumber}`; card.append(heading);
        preview.append(card); hasSpeech = false;
      }
      const row = document.createElement("div");
      const role = { 時間: "time", 場面: "scene", 先生: "teacher", 教師: "teacher", 児童: "student", 確かめる問い: "followup", 参考: "source", AI補足: "source" }[label] || "text";
      row.className = `dialogue-line dialogue-${role}`;
      if (label) { const badge = document.createElement("span"); badge.className = "dialogue-label"; badge.textContent = label; row.append(badge); }
      const value = document.createElement("p");
      let display = body;
      if (role === "source") for (const source of getSources()) display = display.replaceAll(source.id, source.title);
      value.textContent = display; row.append(value); card.append(row);
      if (["teacher", "student", "followup"].includes(role)) hasSpeech = true;
    }
    if (!text) { const empty = document.createElement("p"); empty.textContent = "AI提案、または文章の入力で作成できます。"; preview.append(empty); }
    input.hidden = !editing; preview.hidden = editing;
    toggle.textContent = editing ? "読みやすく表示" : "文章を修正";
    toggle.setAttribute("aria-expanded", String(editing));
  }
  toggle.onclick = () => { editing = !editing; render(); };
  input.oninput = render;
  return () => { editing = !input.value.trim(); render(); };
}
