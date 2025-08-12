const { createClient } = require('@supabase/supabase-js');

// Create Supabase client with service role key for admin operations
const supabase = createClient(
  'https://pvjdsfhhcugnrzmibhab.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2amRzZmhoY3VnbnJ6bWliaGFiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzcwNDA2MSwiZXhwIjoyMDY5MjgwMDYxfQ._J-wcd2ahBrFvn3CqoOqi4zkPS44SR2GwYeG0UMFki4'
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
