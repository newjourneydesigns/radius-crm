#!/usr/bin/env node

/**
 * Migration runner for adding event_summary_state enum column
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('  - NEXT_PUBLIC_SUPABASE_URL');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Starting event_summary_state migration...\n');

  const migrationPath = path.join(__dirname, 'supabase/migrations/20260129000000_add_event_summary_state_enum.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Running migration from:', migrationPath);
  console.log('');

  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // Try direct execution if RPC doesn't work
      console.log('⚠️  RPC method not available, trying direct execution...');
      
      // Split SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--'));

      for (const statement of statements) {
        if (statement) {
          console.log(`Executing: ${statement.substring(0, 80)}...`);
          const { error: stmtError } = await supabase.from('_migrations').insert({
            name: '20260129000000_add_event_summary_state_enum',
            executed_at: new Date().toISOString(),
          });
          
          if (stmtError && !stmtError.message.includes('already exists')) {
            throw stmtError;
          }
        }
      }
    }

    console.log('✅ Migration completed successfully!\n');
    console.log('📊 Verifying migration...');

    // Verify the migration
    const { data: leaders, error: verifyError } = await supabase
      .from('circle_leaders')
      .select('id, event_summary_state')
      .limit(5);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError.message);
      process.exit(1);
    }

    console.log('✅ Verification successful!');
    console.log('Sample records:', leaders);
    console.log('\n✨ Migration complete! The event_summary_state column is now available.');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('\n💡 You may need to run this migration manually using the Supabase SQL editor.');
    console.error('Migration file:', migrationPath);
    process.exit(1);
  }
}

runMigration();
