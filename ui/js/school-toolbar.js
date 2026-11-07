// Shared school context, using qaplain's page-toolbar layout.
export function mountSchoolToolbar(title) {
  const toolbar = document.getElementById("schoolToolbar");
  const heading = document.createElement("h1");
  heading.className = "page-toolbar-title";
  heading.textContent = title;
  const fields = document.createElement("dl");
  fields.className = "page-toolbar-main";
  for (const [key, label] of [["prefecture", "県"], ["city", "市"], ["school_name", "学校"]]) {
    const field = document.createElement("div");
    field.className = "toolbar-field";
    const caption = document.createElement("dt");
    caption.textContent = label;
    const value = document.createElement("dd");
    value.dataset.profileField = key;
    value.textContent = "確認中…";
    field.append(caption, value);
    fields.append(field);
  }
  const actions = document.createElement("nav");
  actions.className = "page-toolbar-actions";
  actions.setAttribute("aria-label", "画面操作");
  const back = document.createElement("a");
  back.className = "btn";
  back.href = "home.html";
  back.textContent = "メニューに戻る";
  actions.append(back);
  toolbar.replaceChildren(heading, fields, actions);
  return profile => {
    for (const value of fields.querySelectorAll("[data-profile-field]")) {
      value.textContent = profile[value.dataset.profileField] || "未登録";
    }
  };
}
