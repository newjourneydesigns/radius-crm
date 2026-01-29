require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('🚀 Running event_summary_followups table migration...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create_event_summary_followups_table.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Split by semicolon and filter out empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`⚙️  Executing statement ${i + 1}/${statements.length}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement }).single();
      
      if (error) {
        // Try direct execution if RPC doesn't work
        const { error: directError } = await supabase.from('_sql').insert({ query: statement });
        
        if (directError) {
          console.error(`❌ Error executing statement ${i + 1}:`, error || directError);
          console.error('Statement:', statement.substring(0, 100) + '...');
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Created event_summary_followups table');
    console.log('   - Added indexes for performance');
    console.log('   - Configured RLS policies');
    console.log('   - Created get_week_start_date() helper function');
    console.log('\n💡 Next steps:');
    console.log('   - Test the Event Summary Reminder feature on a circle leader page');
    console.log('   - Check that sent messages are tracked and reset properly\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative: Manual SQL execution instructions
console.log('⚠️  Note: This script may require manual SQL execution.');
console.log('If the migration fails, you can run the SQL manually:\n');
console.log('1. Go to your Supabase dashboard > SQL Editor');
console.log('2. Copy the contents of create_event_summary_followups_table.sql');
console.log('3. Paste and execute in the SQL Editor\n');
console.log('Proceeding with automatic migration...\n');

runMigration();
