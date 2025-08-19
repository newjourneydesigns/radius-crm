const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixRLSPolicies() {
  console.log('🔧 Fixing RLS policies for reference tables...\n');
  
  const tables = ['circle_types', 'statuses', 'frequencies', 'campuses', 'acpd_list'];
  
  for (const table of tables) {
    console.log(`📋 Fixing RLS policies for ${table}...`);
    
    try {
      // Drop existing policies that might be too restrictive
      await supabase.rpc('sql', {
        query: `
          DROP POLICY IF EXISTS "Allow all operations on ${table}" ON ${table};
          DROP POLICY IF EXISTS "authenticated_users_read_${table}" ON ${table};
          DROP POLICY IF EXISTS "${table}_select" ON ${table};
          DROP POLICY IF EXISTS "${table}_modify" ON ${table};
        `
      });
      
      // Create new permissive policies for reference data
      await supabase.rpc('sql', {
        query: `
          -- Allow all authenticated users to read ${table}
          CREATE POLICY "authenticated_read_${table}" ON ${table}
            FOR SELECT TO authenticated
            USING (true);
          
          -- Allow all authenticated users to modify ${table} (for settings page)
          CREATE POLICY "authenticated_modify_${table}" ON ${table}
            FOR ALL TO authenticated
            USING (true)
            WITH CHECK (true);
        `
      });
      
      console.log(`✅ ${table} policies updated`);
      
    } catch (error) {
      console.log(`❌ Error updating ${table}:`, error.message);
    }
  }
  
  console.log('\n🎉 RLS policies update completed!');
}

fixRLSPolicies().catch(console.error);
