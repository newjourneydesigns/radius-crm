#!/usr/bin/env node

/**
 * Migration runner for creating the event_summary_snapshots table.
 * Run: node run-event-summary-snapshots-migration.js
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
  console.log('🚀 Creating event_summary_snapshots table...\n');

  const migrationPath = path.join(__dirname, 'supabase/migrations/20260415000000_create_event_summary_snapshots.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log('📄 Migration file:', migrationPath);
  console.log('');

  // Execute each statement individually via Supabase RPC or direct call
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });
      if (error) throw error;
      console.log(`✅ ${statement.substring(0, 70).replace(/\n/g, ' ')}...`);
    } catch (err) {
      const msg = err?.message || String(err);
      // Ignore "already exists" errors — idempotent
      if (msg.includes('already exists')) {
        console.log(`⚠️  Already exists (skipped): ${statement.substring(0, 70).replace(/\n/g, ' ')}...`);
      } else {
        console.error(`❌ Failed: ${statement.substring(0, 80)}`);
        console.error(`   Error: ${msg}`);
        process.exit(1);
      }
    }
  }

  console.log('\n📊 Verifying table creation...');
  const { data, error: verifyError } = await supabase
    .from('event_summary_snapshots')
    .select('id')
    .limit(1);

  if (verifyError) {
    console.error('❌ Verification failed:', verifyError.message);
    console.error('\n💡 If exec_sql RPC is not available, paste the contents of');
    console.error('   supabase/migrations/20260415000000_create_event_summary_snapshots.sql');
    console.error('   directly into the Supabase SQL editor.');
    process.exit(1);
  }

  console.log('✅ Table event_summary_snapshots is ready!');
  console.log('\n✨ Migration complete. Weekly snapshot archiving is now enabled.');
}

runMigration().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
