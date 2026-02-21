# Daily Summary Email - Quick Setup Guide

## What Was Created

✅ **Email Service** (`/lib/emailService.ts`)
- HTML email template generation
- Resend API integration
- Formatted summary with leader cards

✅ **API Endpoint** (`/app/api/daily-summary/route.ts`)
- GET: Preview daily summary data
- POST: Send email to recipients
- Queries Supabase for follow-up leaders, tasks, and encouragements

✅ **Scheduled Function** (`/netlify/functions/daily-summary.ts`)
- Runs daily at 8:00 AM UTC
- Automatically triggers email sending
- Netlify-managed cron job

✅ **Documentation** (`/docs/DAILY_SUMMARY_EMAIL.md`)
- Full setup instructions
- Configuration guide
- Troubleshooting tips

✅ **Environment Variables** (`.env.example`)
- Added required configuration examples

## Quick Setup (5 minutes)

### 1. Install Packages

```bash
npm install resend
npm install --save-dev @netlify/functions
```

Or run the installation script:
```bash
./scripts/install-daily-summary.sh
```

### 2. Get Resend API Key

1. Go to [https://resend.com](https://resend.com)
2. Sign up for free (100 emails/day)
3. Get API key from dashboard
4. Copy to clipboard

### 3. Add Environment Variables

Create or update `.env.local`:

```env
# Resend
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Email settings
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Radius CRM
DAILY_SUMMARY_EMAIL=your-email@example.com

# Security (generate random string)
CRON_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### 4. Test Locally

Start dev server:
```bash
npm run dev
```

Test in another terminal:
```bash
# Preview data (no email sent)
curl http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Send test email
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### 5. Deploy to Netlify

```bash
git add .
git commit -m "Add daily summary email feature"
git push
```

In Netlify dashboard:
1. Go to Site settings > Environment variables
2. Add the same variables from step 3
3. Deploy will automatically set up scheduled function

## What Gets Included in Email

📧 **For each circle leader with follow-up:**

- **Leader name** (clickable link to profile)
- Leader campus
- Follow-up date (if set)
- ⚠️ **Overdue Tasks**: Todo items mentioning the leader (past due date)
  - "View All Tasks" button linking to dashboard
- 💚 **Planned Encouragements**: Encouragements scheduled for today
- **Quick Action Buttons:**
  - "View Profile →" - Direct link to leader's page
  - "Add Note" - Jump to notes section

📱 **Navigation Links:**
- "Open Dashboard" button at top
- "Go to Dashboard" button at bottom
- Footer links to Dashboard, All Leaders, Settings

## Email Schedule

**Default**: Every day at 8:00 AM UTC

To change the schedule, edit `/netlify/functions/daily-summary.ts`:

```typescript
// Examples:
'0 8 * * *'     // 8 AM UTC daily
'0 7 * * 1-5'   // 7 AM UTC weekdays only
'0 12 * * *'    // 12 PM UTC daily
```

Time zone conversion:
- 8 AM UTC = 2 AM CST / 3 AM CDT
- 12 PM UTC = 6 AM CST / 7 AM CDT

## How It Works

```
1. Netlify Scheduled Function triggers at 8 AM UTC
   ↓
2. Calls /api/daily-summary endpoint
   ↓
3. API queries Supabase for:
   - Leaders with follow_up_required = true
   - Their overdue todo items
   - Their planned encouragements for today
   ↓
4. Formats data into HTML email
   ↓
5. Sends via Resend API
```

## Testing Tips

### Ensure You Have Test Data

For the email to include content, you need:

1. **Circle leader with follow-up**:
   ```sql
   UPDATE circle_leaders 
   SET follow_up_required = true, 
       follow_up_date = CURRENT_DATE 
   WHERE id = 1;
   ```

2. **Overdue todo** (mentioning leader name):
   - Go to Dashboard
   - Add a todo: "Follow up with John Smith about meeting"
   - Set due date to yesterday
   - Leave uncompleted

3. **Planned encouragement**:
   - Go to Circle Leader profile
   - Add an encouragement with "Planned" status
   - Set date to today

### Check What Data Will Be Sent

```bash
curl http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET" | jq
```

This shows the summary data without sending an email.

## Troubleshooting

**No email received?**
- Check spam folder
- Verify DAILY_SUMMARY_EMAIL is set
- Check Resend dashboard for delivery status
- Look at Netlify function logs

**Empty email?**
- Verify you have circle leaders with follow_up_required = true
- Check follow_up_date is today or earlier
- Ensure todos mention leader names
- Confirm encouragements exist for today

**403/401 errors?**
- Verify CRON_SECRET matches in both places
- Check Authorization header format: `Bearer YOUR_SECRET`

## Next Steps

After setup:
1. ✅ Verify email received next morning
2. ✅ Check email content is accurate
3. ✅ Adjust schedule if needed
4. ✅ Add more recipients if desired

## Files Reference

| File | Purpose |
|------|---------|
| `/lib/emailService.ts` | Email template and Resend integration |
| `/app/api/daily-summary/route.ts` | API endpoint for data and email |
| `/netlify/functions/daily-summary.ts` | Scheduled function trigger |
| `/docs/DAILY_SUMMARY_EMAIL.md` | Full documentation |
| `/.env.example` | Environment variable examples |

## Support

Need help? Check:
1. Full docs: `/docs/DAILY_SUMMARY_EMAIL.md`
2. Netlify function logs in dashboard
3. Resend dashboard for email delivery
4. Supabase logs for data queries
