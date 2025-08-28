const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixNotesCreatedByFK() {
  console.log('🔧 Adding foreign key constraint for notes.created_by...');
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync('./fix_notes_created_by_fk.sql', 'utf8');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      // Try alternative approach
      console.log('🔄 Trying alternative approach...');
      
      // Add foreign key constraint
      const { error: fkError } = await supabase
        .from('notes')
        .select('id')
        .limit(1);
        
      if (fkError) {
        console.error('❌ Connection test failed:', fkError);
      } else {
        console.log('✅ Database connection successful');
        console.log('ℹ️  Please run the SQL manually in your Supabase SQL editor:');
        console.log(sql);
      }
    } else {
      console.log('✅ Foreign key constraint added successfully');
    }
  } catch (error) {
    console.error('❌ Error:', error);
    console.log('ℹ️  Please run the SQL manually in your Supabase SQL editor:');
    const sql = fs.readFileSync('./fix_notes_created_by_fk.sql', 'utf8');
    console.log(sql);
  }
}

fixNotesCreatedByFK()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
