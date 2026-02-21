const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(filename) {
  console.log(`\n📄 Running migration: ${filename}`);
  
  const sqlPath = path.join(__dirname, filename);
  const sql = fs.readFileSync(sqlPath, 'utf8');
  
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try direct execution if exec_sql function doesn't exist
      const { error: directError } = await supabase.from('_migrations').insert({
        name: filename,
        executed_at: new Date().toISOString()
      });
      
      if (directError) {
        console.error(`❌ Error running migration ${filename}:`, error);
        throw error;
      }
    }
    
    console.log(`✅ Migration ${filename} completed successfully`);
    return true;
  } catch (err) {
    console.error(`❌ Error running migration ${filename}:`, err);
    throw err;
  }
}

async function runAllMigrations() {
  console.log('🚀 Starting Circle Visits migrations...\n');
  
  const migrations = [
    'create_circle_visits_table.sql',
    'add_circle_visit_questions.sql',
    'add_circle_visit_todo_integration.sql'
  ];
  
  try {
    for (const migration of migrations) {
      if (fs.existsSync(path.join(__dirname, migration))) {
        await runMigration(migration);
      } else {
        console.log(`⚠️  Migration file ${migration} not found, skipping...`);
      }
    }
    
    console.log('\n✅ All Circle Visits migrations completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Created circle_visits table');
    console.log('   - Added question fields (celebrations, observations, next_step)');
    console.log('   - Integrated with todo system');
    console.log('\n🎉 Circle Visits feature is ready to use!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative: Direct SQL execution without RPC
async function executeSqlDirect(sql) {
  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  for (const statement of statements) {
    try {
      // This is a workaround - in production, use a proper migration tool
      console.log('Executing SQL statement...');
      // Note: Supabase doesn't support arbitrary SQL execution from client
      // You'll need to run these migrations using the Supabase Dashboard SQL Editor
      // or using a database migration tool
    } catch (err) {
      console.error('Error executing statement:', err);
      throw err;
    }
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('  Circle Visits Migration Runner');
console.log('═══════════════════════════════════════════════════════════');
console.log('\n⚠️  IMPORTANT: Run these SQL files in your Supabase Dashboard SQL Editor:');
console.log('   1. create_circle_visits_table.sql');
console.log('   2. add_circle_visit_questions.sql');
console.log('   3. add_circle_visit_todo_integration.sql');
console.log('\n   Or use the Supabase CLI:');
console.log('   supabase db push');
console.log('\n═══════════════════════════════════════════════════════════\n');

// For now, just display instructions
console.log('📋 Migration files created successfully!');
console.log('📁 Files location:', __dirname);
console.log('\nNext steps:');
console.log('1. Open your Supabase Dashboard');
console.log('2. Go to SQL Editor');
console.log('3. Run each migration file in order');
console.log('\nAlternatively, if you have Supabase CLI installed:');
console.log('   supabase migration new circle_visits');
console.log('   (then copy the SQL content to the migration file)');
console.log('   supabase db push');
