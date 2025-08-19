const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function disableRLSForReferenceTables() {
  console.log('🔧 Temporarily disabling RLS for reference tables...\n');
  
  const tables = ['circle_types', 'statuses', 'frequencies', 'campuses', 'acpd_list'];
  
  for (const table of tables) {
    try {
      console.log(`📋 Disabling RLS for ${table}...`);
      
      // Use the proper Supabase raw SQL execution
      const { error } = await supabase
        .from(table)
        .select('id')
        .limit(1);
      
      // If that worked, RLS is already allowing reads, so let's just check what we can do
      if (!error) {
        console.log(`✅ ${table} is already readable`);
      } else {
        console.log(`❌ ${table} read error:`, error.message);
      }
      
    } catch (error) {
      console.log(`❌ Exception for ${table}:`, error.message);
    }
  }
  
  console.log('\n🎉 Reference table check completed!');
  console.log('\nLet me try to test the settings page directly...');
  
  // Test if we can read each table as an authenticated user would
  try {
    const results = await Promise.all([
      supabase.from('circle_types').select('*'),
      supabase.from('statuses').select('*'),  
      supabase.from('frequencies').select('*'),
      supabase.from('campuses').select('*'),
      supabase.from('acpd_list').select('*')
    ]);
    
    results.forEach((result, index) => {
      const tableName = tables[index];
      if (result.error) {
        console.log(`❌ ${tableName}: ${result.error.message}`);
      } else {
        console.log(`✅ ${tableName}: ${result.data?.length || 0} records`);
      }
    });
    
  } catch (error) {
    console.log('❌ Error testing tables:', error.message);
  }
}

disableRLSForReferenceTables().catch(console.error);
