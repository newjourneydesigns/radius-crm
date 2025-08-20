const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Use your existing Supabase URL pattern
const supabaseUrl = 'https://pvjdsfhhcugnrzmibhab.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables. Make sure NEXT_PUBLIC_SUPABASE_ANON_KEY is set.');
  process.exit(1);
}

console.log('Connecting to Supabase...');
const supabase = createClient(supabaseUrl, supabaseKey);

async function runNotesTemplatesMigration() {
  try {
    console.log('🚀 Starting note templates migration...');
    
    // First, check if the table already exists
    const { data: existingTable, error: checkError } = await supabase
      .from('note_templates')
      .select('id')
      .limit(1);
      
    if (!checkError) {
      console.log('✅ note_templates table already exists!');
      return;
    }
    
    if (checkError && !checkError.message.includes('relation "note_templates" does not exist')) {
      console.error('❌ Unexpected error checking table:', checkError);
      return;
    }
    
    console.log('📋 note_templates table does not exist. Please run the following SQL in your Supabase SQL editor:');
    console.log('\n' + '='.repeat(80));
    
    // Read and display the SQL file content
    const sqlFile = path.join(__dirname, 'database-note-templates.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    console.log(sqlContent);
    console.log('='.repeat(80) + '\n');
    
    console.log('📍 Steps to apply:');
    console.log('1. Open your Supabase dashboard');
    console.log('2. Go to the SQL Editor');
    console.log('3. Copy and paste the SQL above');
    console.log('4. Run the query');
    console.log('5. Verify the note_templates table was created');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error);
  }
}

runNotesTemplatesMigration();

async function runNotesTemplatesMigration() {
  try {
    console.log('🚀 Starting note templates migration...');
    
    // First, check if the table already exists
    const { data: existingTable, error: checkError } = await supabase
      .from('note_templates')
      .select('id')
      .limit(1);
      
    if (!checkError) {
      console.log('✅ note_templates table already exists!');
      return;
    }
    
    if (checkError && !checkError.message.includes('relation "note_templates" does not exist')) {
      console.error('❌ Unexpected error checking table:', checkError);
      return;
    }
    
    console.log('� note_templates table does not exist. Please run the following SQL in your Supabase SQL editor:');
    console.log('\n' + '='.repeat(80));
    
    // Read and display the SQL file content
    const sqlFile = path.join(__dirname, 'database-note-templates.sql');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');
    
    console.log(sqlContent);
    console.log('='.repeat(80) + '\n');
    
    console.log('📍 Steps to apply:');
    console.log('1. Open your Supabase dashboard');
    console.log('2. Go to the SQL Editor');
    console.log('3. Copy and paste the SQL above');
    console.log('4. Run the query');
    console.log('5. Verify the note_templates table was created');
    
  } catch (error) {
    console.error('❌ Migration check failed:', error);
  }
}

runNotesTemplatesMigration();

runNotesTemplatesMigration();
