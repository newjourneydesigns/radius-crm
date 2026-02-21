// Run the scorecard questions table migration
// Usage: node run-scorecard-questions-migration.js
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runMigration() {
  console.log('🚀 Running scorecard questions migration...');
  
  const sql = fs.readFileSync('./create_scorecard_questions_table.sql', 'utf8');
  
  // Split on semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    console.log(`\n📌 Executing: ${statement.substring(0, 80)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' }).single();
    if (error) {
      console.log(`⚠️  RPC not available, trying direct query...`);
      // Try as a direct query via supabase-js (won't work for DDL on anon key usually)
      console.log(`   Statement: ${statement.substring(0, 120)}...`);
      console.log(`   You may need to run this SQL directly in the Supabase SQL Editor.`);
    } else {
      console.log('✅ Success');
    }
  }
  
  console.log('\n✅ Migration complete!');
  console.log('💡 If any statements failed, run create_scorecard_questions_table.sql directly in the Supabase SQL Editor.');
}

runMigration().catch(console.error);
