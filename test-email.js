#!/usr/bin/env node

/**
 * Test Daily Summary Email
 * 
 * This script sends a test email using the daily summary API.
 * Make sure your .env.local file has the required variables set.
 */

require('dotenv').config({ path: '.env.local' });

const testEmail = async () => {
  console.log('📧 Daily Summary Email Test\n');
  console.log('============================\n');

  // Check environment variables
  const requiredVars = {
    'RESEND_API_KEY': process.env.RESEND_API_KEY,
    'EMAIL_FROM': process.env.EMAIL_FROM,
    'DAILY_SUMMARY_EMAIL': process.env.DAILY_SUMMARY_EMAIL,
    'CRON_SECRET': process.env.CRON_SECRET,
    'NEXT_PUBLIC_SUPABASE_URL': process.env.NEXT_PUBLIC_SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  console.log('Checking environment variables...\n');
  let allSet = true;
  for (const [key, value] of Object.entries(requiredVars)) {
    const isSet = value && !value.includes('placeholder') && !value.includes('example.com');
    const status = isSet ? '✅' : '❌';
    console.log(`${status} ${key}: ${isSet ? 'Set' : 'Not set or using placeholder'}`);
    if (!isSet) allSet = false;
  }

  if (!allSet) {
    console.log('\n❌ Some environment variables are missing or using placeholders.');
    console.log('\nTo get a Resend API key:');
    console.log('1. Go to https://resend.com');
    console.log('2. Sign up (free: 100 emails/day)');
    console.log('3. Get your API key from the dashboard');
    console.log('4. Update RESEND_API_KEY in .env.local');
    console.log('5. Update DAILY_SUMMARY_EMAIL with your email address');
    console.log('6. Update EMAIL_FROM with your verified domain\n');
    process.exit(1);
  }

  console.log('\n✅ All environment variables are set!\n');

  // Make API request
  const apiUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const endpoint = `${apiUrl}/api/daily-summary`;

  console.log(`Sending test email to: ${process.env.DAILY_SUMMARY_EMAIL}`);
  console.log(`Using API endpoint: ${endpoint}\n`);

  try {
    // Add trailing slash for Next.js App Router
    const url = endpoint.endsWith('/') ? endpoint : endpoint + '/';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
      },
      body: JSON.stringify({
        email: process.env.DAILY_SUMMARY_EMAIL,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error sending email:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ Success!\n');
    console.log(JSON.stringify(data, null, 2));
    
    if (data.skipped) {
      console.log('\n📝 Note: Email was not sent because there are no leaders requiring follow-up today.');
      console.log('To test with data, ensure you have:');
      console.log('  - Circle leaders with follow_up_required = true');
      console.log('  - follow_up_date set to today or earlier');
      console.log('  - Overdue todos or planned encouragements');
    } else {
      console.log('\n📬 Check your inbox for the email!');
      console.log(`   Email sent to: ${process.env.DAILY_SUMMARY_EMAIL}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Make sure your dev server is running:');
    console.error('   npm run dev');
    process.exit(1);
  }
};

// Run the test
testEmail().catch(console.error);
