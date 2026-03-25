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

// Add fetchAll to supabaseClient.ts
const clientPath = path.join(__dirname, 'src/utils/supabaseClient.ts');
let clientContent = fs.readFileSync(clientPath, 'utf8');
if (!clientContent.includes('export async function fetchAll')) {
  clientContent += `\n
export async function fetchAll(sb: SupabaseClient, table: string, select = '*') {
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
}
`;
  fs.writeFileSync(clientPath, clientContent);
  console.log('Updated supabaseClient.ts');
}

filesToPatch.forEach(f => {
  try {
    const fullPath = path.join(__dirname, f);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;

      // Ensure fetchAll is imported
      if (content.includes('utils/supabaseClient') && !content.includes('fetchAll')) {
        content = content.replace(/import \{([^}]+getSupabase[^}]+)\} from ['"]\.\.\/\.\.\/utils\/supabaseClient['"];/, 'import { $1, fetchAll } from "../../utils/supabaseClient";');
        content = content.replace(/import \{([^}]+getSupabase[^}]+)\} from ['"]\.\.\/utils\/supabaseClient['"];/, 'import { $1, fetchAll } from "../utils/supabaseClient";');
      }

      // If there's no import statement at all, add it (like supabaseSync.ts)
      if (!content.includes('fetchAll') && content.includes('getSupabase')) {
        content = content.replace(/import \{([^}]+getSupabase[^}]*)\} from ['"]([^'"]+supabaseClient)['"];/, 'import { $1, fetchAll } from "$2";');
      }

      // Replace sb.from('table').select('*').limit(10000) or without limit
      // Regex: sb\.from\('([^']+)'\)\.select\('\*'\)(?:\.limit\(\d+\))?
      content = content.replace(/sb\.from\('([^']+)'\)\.select\('\*'\)(?:\.limit\(\d+\))?/g, "fetchAll(sb, '$1')");

      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${f}`);
      }
    }
  } catch (err) {
    console.error(`Error processing ${f}:`, err.message);
  }
});
console.log('Done.');
