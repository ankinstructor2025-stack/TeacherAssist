export function renderInstructionLinks(container, materials) {
  container.replaceChildren();
  container.textContent = "";
  for (const item of materials) {
    let url;
    try { url = new URL(item.url); } catch { continue; }
    if (url.protocol !== "https:") continue;
    const link = document.createElement("a");
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${item.title} ／ ${item.edition}`;
    container.append(link);
  }
  if (!container.children.length) container.textContent = "指導計画資料のリンクは未確認です。";
}
