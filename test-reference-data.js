// Test script to verify database queries work with correct column names
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testReferenceData() {
  console.log('Testing reference data queries...\n')
  
  try {
    // Test directors (uses 'name' column)
    console.log('Testing directors (acpd_list)...')
    const { data: directors, error: directorsError } = await supabase
      .from('acpd_list')
      .select('id, name')
      .order('name')
    
    if (directorsError) {
      console.error('Directors error:', directorsError)
    } else {
      console.log('✅ Directors loaded:', directors?.length || 0, 'records')
      if (directors && directors.length > 0) {
        console.log('   Sample:', directors[0])
      }
    }

    // Test campuses (uses 'value' column)
    console.log('\nTesting campuses...')
    const { data: campuses, error: campusesError } = await supabase
      .from('campuses')
      .select('id, value')
      .order('value')
    
    if (campusesError) {
      console.error('Campuses error:', campusesError)
    } else {
      console.log('✅ Campuses loaded:', campuses?.length || 0, 'records')
      if (campuses && campuses.length > 0) {
        console.log('   Sample:', campuses[0])
      }
    }

    // Test statuses (uses 'value' column)
    console.log('\nTesting statuses...')
    const { data: statuses, error: statusesError } = await supabase
      .from('statuses')
      .select('id, value')
      .order('value')
    
    if (statusesError) {
      console.error('Statuses error:', statusesError)
    } else {
      console.log('✅ Statuses loaded:', statuses?.length || 0, 'records')
      if (statuses && statuses.length > 0) {
        console.log('   Sample:', statuses[0])
      }
    }

    // Test circle types (uses 'value' column)
    console.log('\nTesting circle types...')
    const { data: circleTypes, error: circleTypesError } = await supabase
      .from('circle_types')
      .select('id, value')
      .order('value')
    
    if (circleTypesError) {
      console.error('Circle types error:', circleTypesError)
    } else {
      console.log('✅ Circle types loaded:', circleTypes?.length || 0, 'records')
      if (circleTypes && circleTypes.length > 0) {
        console.log('   Sample:', circleTypes[0])
      }
    }

    // Test frequencies (uses 'value' column)
    console.log('\nTesting frequencies...')
    const { data: frequencies, error: frequenciesError } = await supabase
      .from('frequencies')
      .select('id, value')
      .order('value')
    
    if (frequenciesError) {
      console.error('Frequencies error:', frequenciesError)
    } else {
      console.log('✅ Frequencies loaded:', frequencies?.length || 0, 'records')
      if (frequencies && frequencies.length > 0) {
        console.log('   Sample:', frequencies[0])
      }
    }

  } catch (error) {
    console.error('Test failed:', error)
  }
}

testReferenceData()
