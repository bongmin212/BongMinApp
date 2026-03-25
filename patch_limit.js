const fs = require('fs');
const path = require('path');

const files = [
  'src/components/Customers/CustomerList.tsx',
  'src/components/Products/WarehouseList.tsx',
  'src/components/Products/PackageList.tsx',
  'src/components/Dashboard/Dashboard.tsx',
  'src/utils/supabaseSync.ts'
];

files.forEach(f => {
  try {
    const fullPath = path.join(__dirname, f);
    if (fs.existsSync(fullPath)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const original = content;
      // Replace .select('*') with .select('*').limit(10000) only if not already followed by .limit
      content = content.replace(/\.select\('\*'\)(?!\.limit)/g, ".select('*').limit(10000)");
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
