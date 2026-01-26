const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function insertReferenceData() {
  console.log('🔄 Inserting reference data into tables...\n');
  
  try {
    // Insert circle types
    console.log('📝 Inserting Circle Types...');
    const { data: circleTypesData, error: circleTypesError } = await supabase
      .from('circle_types')
      .insert([
        { value: "Men's" },
        { value: "Women's" },
        { value: 'Young Adult | Coed' },
        { value: "Young Adult | Men's" },
        { value: "Young Adult | Women's" },
        { value: "Young Adult | Couple's" }
      ])
      .select();
    
    if (circleTypesError) {
      console.log('❌ Circle Types Error:', circleTypesError.message);
    } else {
      console.log(`✅ Circle Types inserted: ${circleTypesData?.length || 0} records`);
    }
    
    // Insert statuses
    console.log('\n📝 Inserting Statuses...');
    const { data: statusesData, error: statusesError } = await supabase
      .from('statuses')
      .insert([
        { value: 'invited' },
        { value: 'pipeline' },
        { value: 'follow-up' },
        { value: 'active' },
        { value: 'paused' },
        { value: 'off-boarding' }
      ])
      .select();
    
    if (statusesError) {
      console.log('❌ Statuses Error:', statusesError.message);
    } else {
      console.log(`✅ Statuses inserted: ${statusesData?.length || 0} records`);
    }
    
    // Insert frequencies
    console.log('\n📝 Inserting Frequencies...');
    const desiredFrequencies = [
      { value: 'Weekly' },
      { value: '1st, 3rd' },
      { value: '1st, 3rd, 5th' },
      { value: '2nd, 4th' },
      { value: 'Bi-weekly' },
      { value: 'Monthly' },
      { value: 'Quarterly' }
    ];

    const normalizeFrequency = (v) => (v || '')
      .toLowerCase()
      .replace(/\band\b/g, ',')
      .replace(/&/g, ',')
      .replace(/\s+/g, '')
      .replace(/,+/g, ',')
      .replace(/^,|,$/g, '');

    const { data: existingFrequencies, error: existingFrequenciesError } = await supabase
      .from('frequencies')
      .select('value');

    if (existingFrequenciesError) {
      console.log('❌ Frequencies Load Error:', existingFrequenciesError.message);
    }

    const existingKeys = new Set((existingFrequencies || []).map(r => normalizeFrequency(r.value)));
    const missing = desiredFrequencies.filter(r => !existingKeys.has(normalizeFrequency(r.value)));

    let frequenciesData = [];
    let frequenciesError = null;

    if (missing.length === 0) {
      frequenciesData = [];
    } else {
      const res = await supabase
        .from('frequencies')
        .insert(missing)
        .select();
      frequenciesData = res.data;
      frequenciesError = res.error;
    }
    
    if (frequenciesError) {
      console.log('❌ Frequencies Error:', frequenciesError.message);
    } else {
      console.log(`✅ Frequencies inserted: ${frequenciesData?.length || 0} records`);
    }
    
    // Insert campuses
    console.log('\n📝 Inserting Campuses...');
    const { data: campusesData, error: campusesError } = await supabase
      .from('campuses')
      .insert([
        { value: 'Flower Mound' },
        { value: 'Denton' },
        { value: 'Lewisville' },
        { value: 'Gainesville' },
        { value: 'Online' },
        { value: 'University' },
        { value: 'Argyle' }
      ])
      .select();
    
    if (campusesError) {
      console.log('❌ Campuses Error:', campusesError.message);
    } else {
      console.log(`✅ Campuses inserted: ${campusesData?.length || 0} records`);
    }
    
    // Insert directors
    console.log('\n📝 Inserting Directors...');
    const { data: directorsData, error: directorsError } = await supabase
      .from('acpd_list')
      .insert([
        { name: 'Trip Ochenski', description: 'Director of Circle Leader Management', active: true },
        { name: 'Jane Doe', description: 'Associate Director', active: true },
        { name: 'John Smith', description: 'Campus Director', active: true }
      ])
      .select();
    
    if (directorsError) {
      console.log('❌ Directors Error:', directorsError.message);
    } else {
      console.log(`✅ Directors inserted: ${directorsData?.length || 0} records`);
    }
    
    console.log('\n🎉 Reference data insertion completed!');
    
  } catch (error) {
    console.error('\n❌ Unexpected Error:', error.message);
  }
}

insertReferenceData().catch(console.error);
