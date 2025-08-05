const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Hardcode the connection for now - you can replace with your actual values
const supabaseUrl = 'https://pvjdsfhhcugnrzmibhab.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_ANON_KEY is set.');
  process.exit(1);
}

console.log('Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  try {
    console.log('Adding follow_up_required column...');
    
    // Step 1: Add the column
    const { error: addColumnError } = await supabase
      .from('circle_leaders')
      .select('follow_up_required')
      .limit(1);
      
    // If the column doesn't exist, we need to add it manually via SQL
    if (addColumnError && addColumnError.message.includes('column "follow_up_required" does not exist')) {
      console.log('Column does not exist, we need to run the migration via Supabase dashboard');
      console.log('Please run the following SQL in your Supabase SQL editor:');
      console.log('');
      const migrationPath = path.join(__dirname, 'supabase/migrations/modify_follow_up_system.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      console.log(migrationSQL);
      console.log('');
      console.log('After running the SQL, restart the development server.');
      return;
    }
    
    console.log('✅ follow_up_required column already exists!');
  } catch (error) {
    console.error('Error:', error);
    console.log('Please run the migration SQL manually in your Supabase dashboard.');
  }
}

runMigration();
