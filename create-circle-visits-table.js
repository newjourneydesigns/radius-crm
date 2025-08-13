const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createCircleVisitsTable() {
  console.log('Creating circle_visits table...');
  
  const sql = `
-- Create circle_visits table
CREATE TABLE IF NOT EXISTS circle_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
  visit_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
  
  -- Scheduling information
  scheduled_by VARCHAR(255) NOT NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  previsit_note TEXT,
  
  -- Completion information
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by VARCHAR(255),
  
  -- Cancellation information
  canceled_at TIMESTAMP WITH TIME ZONE,
  canceled_by VARCHAR(255),
  cancel_reason TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_circle_visits_leader_id ON circle_visits(leader_id);
CREATE INDEX IF NOT EXISTS idx_circle_visits_visit_date ON circle_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_circle_visits_status ON circle_visits(status);
CREATE INDEX IF NOT EXISTS idx_circle_visits_scheduled_by ON circle_visits(scheduled_by);

-- Create a compound index for common queries
CREATE INDEX IF NOT EXISTS idx_circle_visits_leader_date_status ON circle_visits(leader_id, visit_date, status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_circle_visits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS circle_visits_updated_at
  BEFORE UPDATE ON circle_visits
  FOR EACH ROW
  EXECUTE FUNCTION update_circle_visits_updated_at();

-- Enable Row Level Security
ALTER TABLE circle_visits ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY IF NOT EXISTS "Users can view all circle visits" 
  ON circle_visits FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY IF NOT EXISTS "Users can insert circle visits" 
  ON circle_visits FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Users can update circle visits" 
  ON circle_visits FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY IF NOT EXISTS "Users can delete circle visits" 
  ON circle_visits FOR DELETE 
  TO authenticated 
  USING (true);
  `;

  try {
    const { error } = await supabase.rpc('execute_sql', { sql_query: sql });
    
    if (error) {
      console.error('Error creating table:', error);
      return;
    }
    
    console.log('✅ Circle visits table created successfully!');
    
    // Test the table by trying to query it
    const { data, error: queryError } = await supabase
      .from('circle_visits')
      .select('*')
      .limit(1);
      
    if (queryError) {
      console.error('❌ Error testing table:', queryError);
    } else {
      console.log('✅ Table is accessible and ready for use');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

// Alternative approach using individual queries if RPC doesn't work
async function createCircleVisitsTableAlternative() {
  console.log('Creating circle_visits table using alternative method...');
  
  try {
    // Create the table
    const { error: tableError } = await supabase.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS circle_visits (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          leader_id INTEGER NOT NULL REFERENCES circle_leaders(id) ON DELETE CASCADE,
          visit_date DATE NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'canceled')),
          scheduled_by VARCHAR(255) NOT NULL,
          scheduled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          previsit_note TEXT,
          completed_at TIMESTAMP WITH TIME ZONE,
          completed_by VARCHAR(255),
          canceled_at TIMESTAMP WITH TIME ZONE,
          canceled_by VARCHAR(255),
          cancel_reason TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    });
    
    if (tableError) {
      console.error('Error creating table:', tableError);
      return;
    }
    
    console.log('✅ Circle visits table created successfully!');
    
    // Test the table
    const { data, error: queryError } = await supabase
      .from('circle_visits')
      .select('*')
      .limit(1);
      
    if (queryError) {
      console.error('❌ Error testing table:', queryError);
    } else {
      console.log('✅ Table is accessible and ready for use');
    }
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

async function main() {
  console.log('Setting up Circle Visits database table...');
  
  // Try the first method
  await createCircleVisitsTable();
  
  // If that doesn't work, the user can try the alternative manually
  console.log('\nIf the above failed, you may need to run the SQL manually in the Supabase dashboard SQL editor.');
}

main();
