const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'src/components/Customers/CustomerList.tsx',
  'src/components/Products/WarehouseList.tsx',
  'src/components/Products/PackageList.tsx',
  'src/components/Dashboard/Dashboard.tsx',
  'src/components/Orders/OrderList.tsx',
  'src/utils/supabaseSync.ts'
];

filesToPatch.forEach(f => {
  try {
    const fullPath = path.join(__dirname, f);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;

      // Reverse fetchAll(sb, 'table') -> sb.from('table').select('*')
      content = content.replace(/fetchAll\(sb,\s*'([^']+)'\)/g, "sb.from('$1').select('*')");

      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log(`Reverted ${f}`);
      }
    }
  } catch (err) {
    console.error(`Error processing ${f}:`, err.message);
  }
});

// Update fetchAll signature in supabaseClient.ts to be builder-friendly
const clientPath = path.join(__dirname, 'src/utils/supabaseClient.ts');
if (fs.existsSync(clientPath)) {
  let clientContent = fs.readFileSync(clientPath, 'utf8');
  const fetchAllV1 = `export async function fetchAll(sb: SupabaseClient, table: string, select = '*') {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(select).range(from, from + step - 1);
    if (error) return { data: allData.length > 0 ? allData : null, error };
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }
  return { data: allData, error: null };
}`;
  
  const fetchAllV2 = `export async function fetchAll(queryBuilder: any) {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + step - 1);
    if (error) return { data: allData.length > 0 ? allData : null, error };
    if (!data || data.length === 0) break;
    allData = [...allData, ...data];
    if (data.length < step) break;
    from += step;
  }
  return { data: allData, error: null };
}`;

  clientContent = clientContent.replace(fetchAllV1, fetchAllV2);
  fs.writeFileSync(clientPath, clientContent);
}

console.log('Done revert.');
