export function renderTextbookRows(body, books, grade = 0) {
  body.replaceChildren();
  for (const book of books) {
    const row = document.createElement("tr");
    for (const text of [grade ? `${grade}年` : `${book.grades.join("・")}年`, book.subject, [book.title, book.publisher].filter(Boolean).join(" ／ "), `${book.school_year}年度`]) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }
    const source = document.createElement("td");
    let url;
    try { url = new URL(book.source_url); } catch { /* A missing link must not hide the list. */ }
    if (url?.protocol === "https:") {
      const link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "採択情報";
      source.append(link);
    }
    row.append(source);
    body.append(row);
  }
}
