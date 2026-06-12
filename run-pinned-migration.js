const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  'https://pvjdsfhhcugnrzmibhab.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
  console.log('🔄 Starting pinned column migration...');
  
  try {
    // First, check if the column already exists
    const { data: columns, error: describeError } = await supabase
      .rpc('sql', {
        query: `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'user_notes' AND column_name = 'pinned';
        `
      });
    
    if (describeError) {
      console.error('❌ Error checking table structure:', describeError);
      return;
    }
    
    if (columns && columns.length > 0) {
      console.log('✅ Pinned column already exists!');
      return;
    }
    
    console.log('📝 Adding pinned column to user_notes table...');
    
    // Add the pinned column
    const { error: alterError } = await supabase
      .rpc('sql', {
        query: 'ALTER TABLE user_notes ADD COLUMN IF NOT EXISTS pinned BOOLEAN DEFAULT FALSE;'
      });
    
    if (alterError) {
      console.error('❌ Error adding pinned column:', alterError);
      return;
    }
    
    console.log('📊 Creating index for pinned column...');
    
    // Create index for better performance
    const { error: indexError } = await supabase
      .rpc('sql', {
        query: 'CREATE INDEX IF NOT EXISTS idx_user_notes_pinned ON user_notes(user_id, pinned, created_at);'
      });
    
    if (indexError) {
      console.error('❌ Error creating index:', indexError);
      return;
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('🎉 Pin functionality is now ready to use!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
}

runMigration();
