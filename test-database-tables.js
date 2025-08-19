const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testTables() {
  console.log('🔍 Testing database table connectivity...\n');
  
  const tables = [
    { name: 'acpd_list', display: 'Directors (ACPD List)' },
    { name: 'circle_types', display: 'Circle Types' },
    { name: 'statuses', display: 'Statuses' },
    { name: 'frequencies', display: 'Frequencies' },
    { name: 'campuses', display: 'Campuses' }
  ];
  
  for (const table of tables) {
    try {
      console.log(`📋 Testing ${table.display} (${table.name})...`);
      
      const { data, error, count } = await supabase
        .from(table.name)
        .select('*', { count: 'exact' });
      
      if (error) {
        console.log(`❌ Error: ${error.message}`);
        console.log(`   Code: ${error.code}`);
        console.log(`   Details: ${error.details}\n`);
      } else {
        console.log(`✅ Success! Found ${count} records`);
        if (data && data.length > 0) {
          console.log(`   Sample records:`, data.slice(0, 3));
        }
        console.log('');
      }
    } catch (e) {
      console.log(`❌ Exception: ${e.message}\n`);
    }
  }
}

testTables().catch(console.error);
