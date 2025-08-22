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
  process.exit(1);
}

const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function addUser() {
  console.log('🔍 Adding user to database...');
  
  try {
    // First, check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'trip.ochenski@valleycreek.org')
      .single();
    
    if (existingUser) {
      console.log('✅ User already exists:', existingUser);
      return;
    }
    
    if (checkError && checkError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.log('❌ Error checking existing user:', checkError);
      return;
    }
    
    console.log('👤 User not found, creating new user...');
    
    // Get the current authenticated user's ID from auth
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.log('❌ No authenticated user found. Please log in first.');
      console.log('   Error:', authError?.message);
      return;
    }
    
    console.log('🔑 Found authenticated user:', user.id, user.email);
    
    // Insert user into users table
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        role: 'ACPD' // Since it's a @valleycreek.org email
      })
      .select()
      .single();
    
    if (insertError) {
      console.log('❌ Error inserting user:', insertError);
      console.log('   Code:', insertError.code);
      console.log('   Details:', insertError.details);
      return;
    }
    
    console.log('✅ User successfully created:', newUser);
    
  } catch (error) {
    console.log('❌ Unexpected error:', error);
  }
}

addUser();
