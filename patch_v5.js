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

      // Ensure fetchAll is imported
      if (content.includes('utils/supabaseClient') && !content.includes('fetchAll')) {
        content = content.replace(/import \{([^}]+getSupabase[^}]+)\} from ['"]\.\.\/\.\.\/utils\/supabaseClient['"];/, 'import { $1, fetchAll } from "../../utils/supabaseClient";');
        content = content.replace(/import \{([^}]+getSupabase[^}]+)\} from ['"]\.\.\/utils\/supabaseClient['"];/, 'import { $1, fetchAll } from "../utils/supabaseClient";');
      }
      if (!content.includes('fetchAll') && content.includes('getSupabase')) {
        content = content.replace(/import \{([^}]+getSupabase[^}]*)\} from ['"]([^'"]+supabaseClient)['"];/, 'import { $1, fetchAll } from "$2";');
      }

      // Safe replace: match sb.from('...').select('*') optionally followed by .order(...) 
      // ONLY IF IT IS NOT followed by .eq, .in, .single, .maybeSingle, or .limit
      const safeRegex = /sb\.from\('[^']+'\)\.select\('\*'\)(?:\.order\([^)]+\))?(?!\.(?:eq|in|single|maybeSingle|limit))/g;
      
      // Some calls might already be wrapped in fetchAll from manual edits, so be careful not to double wrap
      // But the negative lookahead prevents this if it's not starting with fetchAll.
      // Wait, let's just use string replacement function to avoid double wrapping
      content = content.replace(safeRegex, (match, offset, string) => {
        // If it's already preceded by 'fetchAll(', skip it
        if (string.substring(offset - 9, offset) === 'fetchAll(') {
          return match;
        }
        return `fetchAll(${match})`;
      });

      if (content !== original) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${f}`);
      }
    }
  } catch (err) {
    console.error(`Error processing ${f}:`, err.message);
  }
});
console.log('Done safe patch.');
