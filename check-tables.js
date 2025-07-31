const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read environment variables from .env.local
let envVars = {};
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });
} catch (e) {
  console.log('Could not read .env.local file');
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkTables() {
  console.log('🔍 Checking database tables...');
  
  const tables = [
    'acpd_list',
    'circle_types', 
    'statuses',
    'frequencies',
    'campuses',
    'circle_leaders'
  ];
  
  for (const table of tables) {
    try {
      console.log(`\n📋 Checking table: ${table}`);
      
      // Try to get table schema info
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
        
      if (error) {
        console.log(`❌ Error: ${error.message}`);
        console.log(`   Code: ${error.code}`);
        console.log(`   Details: ${error.details}`);
      } else {
        console.log(`✅ Table exists with ${count} rows`);
        
        // Try to get a sample record to see the structure
        const { data: sample, error: sampleError } = await supabase
          .from(table)
          .select('*')
          .limit(1);
          
        if (sample && sample.length > 0) {
          console.log(`   Sample structure:`, Object.keys(sample[0]));
          console.log(`   Sample data:`, sample[0]);
        } else if (sample && sample.length === 0) {
          console.log(`   Table is empty`);
        }
      }
    } catch (e) {
      console.log(`❌ Exception: ${e.message}`);
    }
  }
}

checkTables().catch(console.error);
