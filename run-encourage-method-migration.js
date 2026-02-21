#!/usr/bin/env node
/**
 * Migration: Add encourage_method column to acpd_encouragements
 * Adds a new column to track HOW encouragements are sent (text, email, call, etc.)
 * Usage: node run-encourage-method-migration.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  console.error('   Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
  console.log('🚀 Starting encourage_method column migration...\n');

  const sql = fs.readFileSync('./add_encourage_method_column.sql', 'utf-8');

  console.log('📝 Attempting to execute SQL migration...');
  
  // Split on semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  let hasErrors = false;
  
  for (const statement of statements) {
    console.log(`\n📌 Executing: ${statement.substring(0, 80)}...`);
    const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
    
    if (error) {
      console.log(`⚠️  RPC not available or insufficient permissions`);
      console.log(`   Error: ${error.message}`);
      hasErrors = true;
    } else {
      console.log('✅ Success');
    }
  }
  
  if (hasErrors) {
    console.log('\n⚠️  Some statements failed. Please run the SQL directly in Supabase SQL Editor:');
    console.log('\n📋 Copy this SQL:\n');
    console.log('─'.repeat(60));
    console.log(sql);
    console.log('─'.repeat(60));
    console.log('\n1. Go to https://supabase.com/dashboard');
    console.log('2. Open SQL Editor');
    console.log('3. Paste and run the SQL above\n');
  } else {
    console.log('\n✅ Migration completed successfully!');
    console.log('   - Added encourage_method column to acpd_encouragements');
    console.log('   - Column defaults to "other" for existing records');
    console.log('   - Index created for encourage_method\n');
  }
}

runMigration().catch(console.error);
