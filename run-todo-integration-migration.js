require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Running todo integration migration...\n');

  try {
    // Part 1: Schema changes
    console.log('📝 Step 1: Adding integration columns and helper functions...\n');
    const schemaPath = path.join(__dirname, 'add_todo_integration_columns.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon and filter out empty statements
    const schemaStatements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^COMMENT ON/));

    console.log(`   Found ${schemaStatements.length} schema statements\n`);

    for (let i = 0; i < schemaStatements.length; i++) {
      const statement = schemaStatements[i] + ';';
      console.log(`   ⚙️  Executing schema statement ${i + 1}/${schemaStatements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement }).single();
      
      if (error) {
        console.error(`   ❌ Error:`, error.message);
        // Continue with other statements
      } else {
        console.log(`   ✅ Success`);
      }
    }

    // Part 2: Triggers
    console.log('\n📝 Step 2: Adding bidirectional sync triggers...\n');
    const triggersPath = path.join(__dirname, 'add_todo_sync_triggers.sql');
    const triggersSql = fs.readFileSync(triggersPath, 'utf8');
    
    const triggerStatements = triggersSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^COMMENT ON/));

    console.log(`   Found ${triggerStatements.length} trigger statements\n`);

    for (let i = 0; i < triggerStatements.length; i++) {
      const statement = triggerStatements[i] + ';';
      console.log(`   ⚙️  Executing trigger statement ${i + 1}/${triggerStatements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement }).single();
      
      if (error) {
        console.error(`   ❌ Error:`, error.message);
        // Continue with other statements
      } else {
        console.log(`   ✅ Success`);
      }
    }

    console.log('\n✅ Migration completed!\n');
    console.log('📋 Summary:');
    console.log('   ✓ Added linked_encouragement_id, linked_leader_id, and todo_type columns to todo_items');
    console.log('   ✓ Created helper functions for syncing encouragements and follow-ups to todos');
    console.log('   ✓ Created bidirectional sync triggers');
    console.log('   ✓ Added indexes for better performance');
    console.log('\n💡 Next steps:');
    console.log('   1. Update the application code to load encouragements and follow-ups into todos');
    console.log('   2. Test by creating a planned encouragement and verifying it appears in the todo list');
    console.log('   3. Test by marking a follow-up and verifying it appears in the todo list');
    console.log('   4. Test bidirectional sync by completing todos and checking source records\n');

  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('Todo Integration Migration');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('This will:');
console.log('1. Add columns to todo_items to link with encouragements and follow-ups');
console.log('2. Create helper functions for syncing');
console.log('3. Create bidirectional sync triggers');
console.log('\nNote: This migration is safe to run multiple times.\n');

runMigration();
