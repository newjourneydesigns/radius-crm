const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read environment variables from .env.local
let envVars = {};
try {
  const envContent = fs.readFileSync('.env.local', 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      envVars[key.trim()] = value.trim();
    }
  });
} catch (e) {
  console.log('Could not read .env.local file');
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function populateReferenceTables() {
  console.log('🔍 Extracting unique values from circle_leaders...');
  
  try {
    const { data: circleLeaders, error } = await supabase
      .from('circle_leaders')
      .select('campus, circle_type, status, frequency');
    
    if (error) {
      console.error('Error fetching circle leaders:', error);
      return;
    }
    
    // Extract unique values
    const campuses = [...new Set(circleLeaders.map(cl => cl.campus).filter(Boolean))];
    const circleTypes = [...new Set(circleLeaders.map(cl => cl.circle_type).filter(Boolean))];
    const statuses = [...new Set(circleLeaders.map(cl => cl.status).filter(Boolean))];
    const frequencies = [...new Set(circleLeaders.map(cl => cl.frequency).filter(Boolean))];
    
    console.log('\n📊 Found unique values:');
    console.log('Campuses:', campuses);
    console.log('Circle Types:', circleTypes);
    console.log('Statuses:', statuses);  
    console.log('Frequencies:', frequencies);
    
    // Populate campuses table
    if (campuses.length > 0) {
      console.log('\n🏢 Populating campuses table...');
      const campusData = campuses.map(campus => ({ value: campus }));
      const { data, error } = await supabase
        .from('campuses')
        .insert(campusData)
        .select();
      
      if (error) {
        console.error('Error inserting campuses:', error);
      } else {
        console.log(`✅ Inserted ${data.length} campuses`);
      }
    }
    
    // Populate circle_types table
    if (circleTypes.length > 0) {
      console.log('\n🔵 Populating circle_types table...');
      const typeData = circleTypes.map(type => ({ value: type }));
      const { data, error } = await supabase
        .from('circle_types')
        .insert(typeData)
        .select();
      
      if (error) {
        console.error('Error inserting circle types:', error);
      } else {
        console.log(`✅ Inserted ${data.length} circle types`);
      }
    }
    
    // Populate statuses table
    if (statuses.length > 0) {
      console.log('\n📊 Populating statuses table...');
      const statusData = statuses.map(status => ({ value: status }));
      const { data, error } = await supabase
        .from('statuses')
        .insert(statusData)
        .select();
      
      if (error) {
        console.error('Error inserting statuses:', error);
      } else {
        console.log(`✅ Inserted ${data.length} statuses`);
      }
    }
    
    // Populate frequencies table
    if (frequencies.length > 0) {
      console.log('\n📅 Populating frequencies table...');
      const frequencyData = frequencies.map(frequency => ({ value: frequency }));
      const { data, error } = await supabase
        .from('frequencies')
        .insert(frequencyData)
        .select();
      
      if (error) {
        console.error('Error inserting frequencies:', error);
      } else {
        console.log(`✅ Inserted ${data.length} frequencies`);
      }
    }
    
    console.log('\n🎉 Reference tables populated successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

populateReferenceTables().catch(console.error);
