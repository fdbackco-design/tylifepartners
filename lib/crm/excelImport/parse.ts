import * as XLSX from "xlsx";
import { dedupeRowsByPhone, parseExcelRowByPosition, type ExcelImportRawRow } from "@/lib/crm/excelImport/logic";

export function parseBeforeDbWorkbook(buffer: ArrayBuffer | Buffer): {
  rows: ExcelImportRawRow[];
  selected: ExcelImportRawRow[];
  excludedDuplicates: ReturnType<typeof dedupeRowsByPhone>["excluded"];
} {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("엑셀 시트가 없습니다.");
  const sheet = wb.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  if (!matrix.length) throw new Error("엑셀이 비어 있습니다.");

  const rows: ExcelImportRawRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    // skip fully empty rows
    const hasAny = cells.some((c) => c != null && String(c).trim() !== "");
    if (!hasAny) continue;
    rows.push(parseExcelRowByPosition(i + 1, cells));
  }

  const { selected, excluded } = dedupeRowsByPhone(rows);
  return { rows, selected, excludedDuplicates: excluded };
}

export function buildResultWorkbook(
  results: Array<Record<string, string | number | boolean | null | undefined>>
): Buffer {
  const ws = XLSX.utils.json_to_sheet(results);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "결과");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return out;
}
