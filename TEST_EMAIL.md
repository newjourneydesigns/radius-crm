# 📧 Send Test Email - Quick Guide

I've set up the email configuration in your `.env.local` file. Here's what you need to do:

## Step 1: Get a Resend API Key (2 minutes)

1. Go to **[https://resend.com](https://resend.com)**
2. Sign up for a free account (100 emails/day, no credit card required)
3. Verify your email
4. In the dashboard, click **"API Keys"**
5. Click **"Create API Key"**
6. Copy the key (starts with `re_`)

## Step 2: Update Your `.env.local`

Replace these values in your `.env.local` file:

```env
# Replace this with your actual Resend API key
RESEND_API_KEY=re_your_actual_api_key_here

# Replace with your email address where you want to receive the summary
DAILY_SUMMARY_EMAIL=your-actual-email@example.com

# Optional: Update the from email (or use Resend's test domain)
EMAIL_FROM=onboarding@resend.dev
```

**Note:** Resend provides a test domain `onboarding@resend.dev` you can use immediately without domain verification!

## Step 3: Install Dependencies (if not done yet)

```bash
npm install
```

## Step 4: Start Your Dev Server

```bash
npm run dev
```

## Step 5: Send Test Email

In a **new terminal window**, run:

```bash
node test-email.js
```

## Alternative: Manual Test with curl

```bash
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer 103d4341c6c684e7c8890aca6c608d0b90c852a8c4ee0a49203b7ff308242234" \
  -H "Content-Type: application/json"
```

## What to Expect

The test script will:
1. ✅ Check all environment variables are set
2. 📧 Send a request to your API
3. 📬 Send an email with your daily summary
4. ✅ Show success or error messages

### If No Email is Sent

The email might be skipped if you don't have any leaders requiring follow-up. To test with actual data:

1. Go to your dashboard
2. Set a circle leader to "follow-up required"
3. Set follow-up date to today or earlier
4. Run the test again

## Troubleshooting

### "RESEND_API_KEY not set"
- Make sure you added your actual API key to `.env.local`
- Restart your dev server after updating `.env.local`

### "Connection refused"
- Make sure `npm run dev` is running
- Check that it's running on `http://localhost:3000`

### "Email not received"
- Check your spam folder
- Verify the email address in `DAILY_SUMMARY_EMAIL`
- Check Resend dashboard at https://resend.com/emails for delivery status

---

## Already Set Up? Quick Test Command

```bash
node test-email.js
```

That's it! 🎉
