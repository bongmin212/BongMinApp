import * as XLSX from 'xlsx';

export type WorksheetColumn = {
  header: string;
  key: string;
  width?: number;
};

export function exportToXlsx<T extends Record<string, any>>(
  data: T[],
  columns: WorksheetColumn[],
  filename: string,
  sheetName: string = 'Sheet1'
): void {
  const headers = columns.map(c => c.header);
  const keys = columns.map(c => c.key);

  const rows = data.map(row => {
    const out: Record<string, any> = {};
    keys.forEach((k, idx) => {
      const key = headers[idx];
      let value = row[k];
      if (value === undefined || value === null) value = '';
      if (typeof value === 'string') {
        value = value.replace(/\r?\n/g, ' ');
      }
      out[key] = value;
    });
    return out;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });

  // Auto width (approx) if no explicit width provided
  const colWidths = headers.map((h, idx) => {
    const explicit = columns[idx]?.width;
    if (explicit && explicit > 0) return { wch: explicit } as XLSX.ColInfo;
    const values = [h, ...rows.map(r => String(r[h] ?? ''))];
    const maxLen = Math.min(80, Math.max(...values.map(v => v.length))); // cap at 80
    return { wch: Math.max(10, maxLen + 2) } as XLSX.ColInfo;
  });
  (worksheet as any)['!cols'] = colWidths;

  // Freeze header row
  (worksheet as any)['!freeze'] = { xSplit: 0, ySplit: 1 };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}


