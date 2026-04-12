const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const baseDir = "X:\\소비일기 데이터베이스";
const targetNames = new Set([
  "일시불+할부_카드이용내역조회 (6).xlsx",
  "일시불+할부_카드이용내역조회 (11).xlsx",
  "일시불+할부_카드이용내역조회 (16).xlsx",
]);

const files = fs
  .readdirSync(baseDir)
  .filter((name) => targetNames.has(name))
  .sort((a, b) => a.localeCompare(b, "ko"))
  .map((name) => path.join(baseDir, name));

for (const file of files) {
  console.log(`FILE: ${file}`);
  const workbook = XLSX.readFile(file, { cellDates: false });
  console.log(`SHEETS: ${workbook.SheetNames.join(", ")}`);

  for (const sheetName of workbook.SheetNames.slice(0, 3)) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: null });
    console.log(`SHEET: ${sheetName}`);
    rows.slice(0, 15).forEach((row, index) => {
      const values = row.slice(0, 12).map((value) => (value == null ? "" : String(value)));
      console.log(`${index + 1}: ${values.join(" | ")}`);
    });
    console.log("---");
  }

  console.log("====");
}
