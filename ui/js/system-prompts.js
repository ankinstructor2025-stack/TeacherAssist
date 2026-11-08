import { startSystemPage } from "./system-page.js?v=20261108-10";

await startSystemPage(async (request, isCurrent) => {
  const result = await request();
  if (!isCurrent()) return;
  const list = document.getElementById("promptList");
  list.replaceChildren();
  for (const item of result.prompts) {
    const row = document.createElement("tr");
    for (const value of [item.prompt_name, item.updated_at ? new Date(item.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "未登録（既定値を使用）"]) {
      const cell = document.createElement("td"); cell.textContent = value; row.append(cell);
    }
    const actions = document.createElement("td");
    const edit = document.createElement("a");
    edit.className = "btn";
    edit.href = `system_prompt_edit.html?type=${encodeURIComponent(item.prompt_type)}`;
    edit.textContent = "修正";
    actions.append(edit); row.append(actions); list.append(row);
  }
}, "/system/prompts");
