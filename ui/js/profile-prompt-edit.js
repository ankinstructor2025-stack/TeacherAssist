import { startTeachingPage } from "./teaching-page.js?v=20261108-6";
import { setupPromptEditor } from "./prompt-editor.js";

const endpoint = "/profile/prompts/lesson_plan";
await startTeachingPage("プロンプト設定", {}, async (data, request, isCurrent) => {
  setupPromptEditor(data, request, endpoint, isCurrent, true);
}, endpoint);
