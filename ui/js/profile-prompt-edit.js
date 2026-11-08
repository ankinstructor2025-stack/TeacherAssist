import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { setupPromptEditor } from "./prompt-editor.js";

const type = new URLSearchParams(window.location.search).get("type") || "lesson_plan";
const endpoint = `/profile/prompts/${encodeURIComponent(type)}`;
await startTeachingPage("プロンプト設定", {}, async (data, request, isCurrent) => {
  setupPromptEditor(data, request, endpoint, isCurrent, true);
}, endpoint);
