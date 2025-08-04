const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials from environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixDatabasePerformance() {
  console.log('🔧 Applying database performance fixes...');

  try {
    // Apply the performance fixes
    const queries = [
      'CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)',
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_circle_leaders_id ON circle_leaders(id)',
      'CREATE INDEX IF NOT EXISTS idx_circle_leaders_status ON circle_leaders(status)',
      'CREATE INDEX IF NOT EXISTS idx_circle_leaders_campus ON circle_leaders(campus)',
      'CREATE INDEX IF NOT EXISTS idx_circle_leaders_created_at ON circle_leaders(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_notes_leader_id ON notes(leader_id)',
      'CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by)',
      'CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)'
    ];

    for (const query of queries) {
      console.log('📝 Executing:', query);
      const { error } = await supabase.rpc('exec_sql', { sql: query });
      if (error) {
        console.error('❌ Error executing query:', query, error);
      } else {
        console.log('✅ Success:', query);
      }
    }

    // Test the user profile query performance
    console.log('\n🧪 Testing user profile query performance...');
    const startTime = Date.now();
    
    const { data: session } = await supabase.auth.getSession();
    if (session?.session?.user) {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.session.user.id)
        .single();
      
      const endTime = Date.now();
      const queryTime = endTime - startTime;
      
      if (error) {
        console.error('❌ Query error:', error);
      } else {
        console.log(`✅ Query completed in ${queryTime}ms`);
        console.log('📊 Profile data:', profile ? 'Found' : 'Not found');
      }
    } else {
      console.log('ℹ️ No active session to test with');
    }

  } catch (error) {
    console.error('❌ Error applying database fixes:', error);
  }
}

// Alternative method using direct SQL execution
async function fixDatabasePerformanceAlt() {
  console.log('🔧 Applying database performance fixes (alternative method)...');
  
  try {
    // Create a SQL function to execute our index creation
    const createIndexFunction = `
      CREATE OR REPLACE FUNCTION create_missing_indexes()
      RETURNS text AS $$
      BEGIN
        -- Create indexes if they don't exist
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_id ON users(id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_circle_leaders_id ON circle_leaders(id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_circle_leaders_status ON circle_leaders(status)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_circle_leaders_campus ON circle_leaders(campus)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_circle_leaders_created_at ON circle_leaders(created_at)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notes_leader_id ON notes(leader_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at)';
        
        RETURN 'Indexes created successfully';
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;
    `;

    console.log('📝 Creating index function...');
    const { error: functionError } = await supabase.rpc('exec_sql', { sql: createIndexFunction });
    
    if (functionError) {
      console.error('❌ Error creating function:', functionError);
      return;
    }

    console.log('📝 Executing index function...');
    const { data, error } = await supabase.rpc('create_missing_indexes');
    
    if (error) {
      console.error('❌ Error executing index function:', error);
    } else {
      console.log('✅ Success:', data);
    }

  } catch (error) {
    console.error('❌ Error in alternative method:', error);
  }
}

// Run the fixes
console.log('🚀 Starting database performance optimization...');
fixDatabasePerformance().then(() => {
  console.log('🎉 Database performance optimization complete!');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Failed to optimize database:', error);
  process.exit(1);
});
