function xmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeSheetName(name: string): string {
  const cleaned = String(name || "Sheet1")
    .replace(/[\\/*?:\[\]]/g, "")
    .slice(0, 31);
  return cleaned || "Sheet1";
}

export function toExcelXml(sheetName: string, headers: string[], rows: unknown[][]): string {
  const header = headers.map((h) => `<Cell><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>`).join("");
  const body = rows
    .map(
      (r) =>
        `<Row>${r.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join("")}</Row>`
    )
    .join("\n");
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${xmlEscape(safeSheetName(sheetName))}">
<Table>
<Row>${header}</Row>
${body}
</Table>
</Worksheet>
</Workbook>`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${[headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n")}\n`;
}
