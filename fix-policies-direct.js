const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixPoliciesDirectly() {
  console.log('🔧 Creating simple RLS policies for reference tables...\n');
  
  const policies = [
    {
      table: 'circle_types',
      policy: 'authenticated_access_circle_types',
      sql: 'CREATE POLICY "authenticated_access_circle_types" ON circle_types FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    },
    {
      table: 'statuses', 
      policy: 'authenticated_access_statuses',
      sql: 'CREATE POLICY "authenticated_access_statuses" ON statuses FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    },
    {
      table: 'frequencies',
      policy: 'authenticated_access_frequencies', 
      sql: 'CREATE POLICY "authenticated_access_frequencies" ON frequencies FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    },
    {
      table: 'campuses',
      policy: 'authenticated_access_campuses',
      sql: 'CREATE POLICY "authenticated_access_campuses" ON campuses FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    },
    {
      table: 'acpd_list',
      policy: 'authenticated_access_acpd_list',
      sql: 'CREATE POLICY "authenticated_access_acpd_list" ON acpd_list FOR ALL TO authenticated USING (true) WITH CHECK (true);'
    }
  ];
  
  for (const { table, policy, sql } of policies) {
    try {
      console.log(`📋 Creating policy for ${table}...`);
      
      // First drop any existing policy with the same name
      const dropSql = `DROP POLICY IF EXISTS "${policy}" ON ${table};`;
      const { error: dropError } = await supabase.rpc('sql', { query: dropSql });
      
      // Create the new policy  
      const { error: createError } = await supabase.rpc('sql', { query: sql });
      
      if (createError) {
        console.log(`❌ Error creating policy for ${table}:`, createError.message);
      } else {
        console.log(`✅ Policy created for ${table}`);
      }
      
    } catch (error) {
      console.log(`❌ Exception for ${table}:`, error.message);
    }
  }
  
  console.log('\n🎉 Policy creation completed!');
}

fixPoliciesDirectly().catch(console.error);
