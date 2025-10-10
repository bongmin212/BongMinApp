import * as XLSX from 'xlsx';

export type WorksheetColumn = {
  header: string;
  key: string;
  width?: number;
};

export function generateExportFilename(
  componentName: string,
  filters: Record<string, any> = {},
  prefix: string = ''
): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '-').replace('T', '_');
  
  // Sanitize function for filter values
  const sanitize = (value: any): string => {
    if (value === null || value === undefined || value === '') return '';
    const str = String(value);
    return str
      .replace(/[/\\:*?"<>|]/g, '') // Remove special filesystem characters
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .slice(0, 30); // Limit length
  };

  // Filter mapping for better naming
  const filterMap: Record<string, string> = {
    searchTerm: 'Search',
    debouncedSearchTerm: 'Search',
    debouncedSearchQuery: 'Search',
    searchStatus: 'Status',
    filterProduct: 'Product',
    filterPackage: 'Package',
    filterStatus: 'Status',
    filterPayment: 'Payment',
    filterPaymentStatus: 'Payment',
    filterType: 'Type',
    filterSource: 'Source',
    dateFrom: 'From',
    dateTo: 'To',
    minAmount: 'Min',
    maxAmount: 'Max',
    expiryFilter: 'Expiry',
    onlyExpiringNotSent: 'ExpiringNotSent',
    onlyAccounts: 'Accounts',
    onlyFreeSlots: 'FreeSlots',
    selectedEmployee: 'Employee',
    selectedProduct: 'Product'
  };

  const filterParts: string[] = [];
  
  // Process each filter
  Object.entries(filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    
    const filterName = filterMap[key] || key;
    let filterValue = value;
    
    // Special handling for different value types
    if (typeof value === 'boolean') {
      filterValue = value ? 'true' : 'false';
    } else if (value instanceof Date) {
      filterValue = value.toISOString().slice(0, 10); // YYYY-MM-DD
    } else if (typeof value === 'object' && value.name) {
      // For objects with name property (like products, customers)
      filterValue = value.name;
    }
    
    const sanitizedValue = sanitize(filterValue);
    if (sanitizedValue) {
      filterParts.push(`${filterName}-${sanitizedValue}`);
    }
  });

  const baseName = prefix ? `${prefix}_${componentName}` : componentName;
  const filterString = filterParts.length > 0 ? `_${filterParts.join('_')}` : '';
  
  return `${baseName}_${timestamp}${filterString}.xlsx`;
}

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


