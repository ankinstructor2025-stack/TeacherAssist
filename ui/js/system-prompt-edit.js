import { startSystemPage } from "./system-page.js?v=20261108-10";
import { setupPromptEditor } from "./prompt-editor.js";

const type = new URLSearchParams(window.location.search).get("type") || "lesson_plan";
await startSystemPage(async (request, isCurrent) => {
  const path = `/${encodeURIComponent(type)}`;
  const data = await request(path);
  if (!isCurrent()) return;
  document.getElementById("pageTitle").textContent = `${data.prompt_name} プロンプト修正`;
  setupPromptEditor(data, request, path, isCurrent);
}, "/system/prompts");
