const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  // Create Supabase client with service role key for admin operations
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('🔄 Starting pinned column migration...');
  
  try {
    // First, check if the column already exists by trying to select it
    console.log('🔍 Checking if pinned column exists...');
    
    const { data: testData, error: testError } = await supabase
      .from('user_notes')
      .select('pinned')
      .limit(1);
    
    if (!testError) {
      console.log('✅ Pinned column already exists!');
      return;
    }
    
    if (testError.code !== '42703') {
      console.error('❌ Unexpected error:', testError);
      return;
    }
    
    console.log('📝 Adding pinned column to user_notes table...');
    
    // Add the pinned column using raw SQL
    const { error: alterError } = await supabase.rpc('exec_sql', {
      sql: 'ALTER TABLE user_notes ADD COLUMN pinned BOOLEAN DEFAULT FALSE;'
    });
    
    if (alterError) {
      console.error('❌ Error adding pinned column:', alterError);
      return;
    }
    
    console.log('📊 Creating index for pinned column...');
    
    // Create index for better performance
    const { error: indexError } = await supabase.rpc('exec_sql', {
      sql: 'CREATE INDEX idx_user_notes_pinned ON user_notes(user_id, pinned, created_at);'
    });
    
    if (indexError) {
      console.error('⚠️ Index creation warning (may already exist):', indexError);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('🎉 Pin functionality is now ready to use!');
    
    // Test the new column
    const { data: finalTest, error: finalError } = await supabase
      .from('user_notes')
      .select('pinned')
      .limit(1);
    
    if (finalError) {
      console.error('❌ Final test failed:', finalError);
    } else {
      console.log('✅ Final test passed - pinned column is working!');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();
