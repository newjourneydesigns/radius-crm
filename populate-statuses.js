const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const statuses = [
  'invited',
  'pipeline', 
  'on-boarding',
  'active',
  'paused',
  'off-boarding',
  'archive',
  'follow-up'
];

async function populateStatuses() {
  console.log('Populating statuses table...');
  
  // First, check if statuses already exist
  const { data: existingStatuses, error: checkError } = await supabase
    .from('statuses')
    .select('value');
  
  if (checkError) {
    console.error('Error checking existing statuses:', checkError);
    return;
  }
  
  console.log('Existing statuses:', existingStatuses?.length || 0);
  
  if (existingStatuses && existingStatuses.length > 0) {
    console.log('Statuses already exist:', existingStatuses.map(s => s.value));
    return;
  }
  
  // Insert new statuses
  const statusRows = statuses.map(status => ({ value: status }));
  
  const { data, error } = await supabase
    .from('statuses')
    .insert(statusRows)
    .select();
  
  if (error) {
    console.error('Error inserting statuses:', error);
  } else {
    console.log('Successfully inserted statuses:', data);
  }
}

populateStatuses()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
