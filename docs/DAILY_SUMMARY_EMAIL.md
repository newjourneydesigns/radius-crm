# Daily Summary Email Feature

This feature sends a daily summary email at the start of each day with circle leaders that need follow-up, their overdue tasks, and planned encouragements.

## Features

- **Automated Daily Emails**: Sends emails automatically every morning
- **Follow-Up Leaders**: Lists all circle leaders with follow-up required for today or overdue
- **Overdue Tasks**: Shows any todo items that mention the leader's name and are past due
- **Planned Encouragements**: Displays encouragements scheduled for today
- **Beautiful HTML Email**: Responsive email template with leader details organized in cards

## Setup Instructions

### 1. Install Dependencies

```bash
npm install resend @netlify/functions
```

### 2. Configure Environment Variables

Add the following environment variables to your `.env.local` file (for local development) and to your Netlify deployment settings:

```env
# Resend API Key (get from https://resend.com)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Email configuration
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Radius CRM
DAILY_SUMMARY_EMAIL=your-email@example.com

# Security (generate a random secret)
CRON_SECRET=your_random_secret_here

# Application URL (automatically set by Netlify)
NEXT_PUBLIC_APP_URL=https://your-app.netlify.app
```

#### Getting a Resend API Key

1. Sign up for a free account at [https://resend.com](https://resend.com)
2. Verify your domain or use the test email provided
3. Generate an API key from the dashboard
4. Add it to your environment variables as `RESEND_API_KEY`

#### Generating a CRON_SECRET

```bash
# Generate a random secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Enable Netlify Scheduled Functions

The scheduled function is configured to run daily at 8:00 AM UTC. To modify the schedule:

1. Edit `/netlify/functions/daily-summary.ts`
2. Change the cron expression in `schedule('0 8 * * *', ...)`:
   - `0 8 * * *` = 8:00 AM UTC daily
   - `0 12 * * *` = 12:00 PM UTC daily
   - `0 6 * * 1-5` = 6:00 AM UTC on weekdays only

For more cron expression examples, see: https://crontab.guru

### 4. Deploy to Netlify

```bash
git add .
git commit -m "Add daily summary email feature"
git push
```

Netlify will automatically:
- Deploy your changes
- Set up the scheduled function
- Start running the daily summary at the specified time

## Testing

### Test Locally

1. Start your development server:
```bash
npm run dev
```

2. Test the data gathering (GET request):
```bash
curl -H "Authorization: Bearer your_cron_secret" http://localhost:3000/api/daily-summary
```

3. Test email sending (POST request):
```bash
curl -X POST \
  -H "Authorization: Bearer your_cron_secret" \
  -H "Content-Type: application/json" \
  -d '{"email": "your-test-email@example.com"}' \
  http://localhost:3000/api/daily-summary
```

### Test on Netlify

After deployment, you can manually trigger the function:

```bash
curl -X POST https://your-app.netlify.app/api/daily-summary \
  -H "Authorization: Bearer your_cron_secret" \
  -H "Content-Type: application/json"
```

Or use Netlify's function logs to monitor scheduled executions.

## How It Works

### Data Collection

The system queries your Supabase database for:

1. **Circle Leaders with Follow-Up Required**
   - Filters leaders where `follow_up_required = true`
   - Only includes leaders with `follow_up_date` today or earlier

2. **Overdue Tasks**
   - Queries the `todo_items` table for incomplete tasks with `due_date < today`
   - Filters tasks that mention the leader's name in the text

3. **Planned Encouragements**
   - Queries the `encouragements` table for planned items
   - Filters by `message_type = 'planned'` and `message_date = today`

### Email Template

The email includes:
- Header with current date
- **"Open Dashboard" button** for quick access
- Leader cards showing:
  - **Leader name (clickable link)** to their profile page
  - Leader campus
  - Follow-up date (if set)
  - List of overdue tasks with due dates
  - **"View All Tasks" button** linking to dashboard
  - List of planned encouragements with methods and notes
  - **Quick action buttons:**
    - "View Profile →" - Opens leader's detail page
    - "Add Note" - Jumps to notes section on profile
- **"Go to Dashboard" button** for easy navigation
- Footer with mission statement and navigation links:
  - Dashboard
  - All Leaders
  - Settings

All links deep-link directly into the Radius CRM application for seamless navigation.

### Security

- The API endpoint requires authorization via the `CRON_SECRET`
- Only requests with the correct Bearer token can trigger emails
- Scheduled function automatically includes the token

## Customization

### Change Email Recipients

You can send to multiple recipients by modifying the API or environment variable:

```env
DAILY_SUMMARY_EMAIL=email1@example.com,email2@example.com,email3@example.com
```

Or use the API directly:

```bash
curl -X POST https://your-app.netlify.app/api/daily-summary \
  -H "Authorization: Bearer your_cron_secret" \
  -H "Content-Type: application/json" \
  -d '{"email": ["email1@example.com", "email2@example.com"]}'
```

### Customize Email Template

Edit `/lib/emailService.ts` and modify the `generateDailySummaryHTML` function to change:
- Email styling
- Content layout
- Additional data sections

### Change Schedule

Edit `/netlify/functions/daily-summary.ts` and modify the cron expression:

```typescript
// Current: Daily at 8:00 AM UTC
const handler = schedule('0 8 * * *', async (event) => {

// Example: Weekdays at 7:00 AM UTC
const handler = schedule('0 7 * * 1-5', async (event) => {

// Example: Every 6 hours
const handler = schedule('0 */6 * * *', async (event) => {
```

## Troubleshooting

### Emails Not Sending

1. Check Netlify function logs for errors
2. Verify `RESEND_API_KEY` is set correctly
3. Confirm your email domain is verified in Resend
4. Check `DAILY_SUMMARY_EMAIL` is set

### No Data in Email

1. Verify circle leaders have `follow_up_required = true`
2. Check that `follow_up_date` is today or earlier
3. Ensure todo items mention leader names
4. Confirm planned encouragements exist for today

### Scheduled Function Not Running

1. Check Netlify deployment logs
2. Verify `@netlify/functions` is installed
3. Ensure the function is in `/netlify/functions/` directory
4. Check Netlify Functions dashboard for execution logs

## Architecture

```
┌─────────────────────────────────────────┐
│   Netlify Scheduled Function            │
│   (Runs daily at 8 AM UTC)              │
│   /netlify/functions/daily-summary.ts   │
└────────────────┬────────────────────────┘
                 │
                 │ HTTP POST
                 ▼
┌─────────────────────────────────────────┐
│   API Route                              │
│   /app/api/daily-summary/route.ts       │
│   - Gathers data from Supabase          │
│   - Formats email content               │
│   - Sends via Resend                    │
└────────────────┬────────────────────────┘
                 │
      ┌──────────┴──────────┐
      │                     │
      ▼                     ▼
┌─────────────┐      ┌──────────────┐
│  Supabase   │      │   Resend     │
│  Database   │      │   Email API  │
└─────────────┘      └──────────────┘
```

## Files Created/Modified

- `/lib/emailService.ts` - Email template and sending logic
- `/app/api/daily-summary/route.ts` - API endpoint for data gathering and email sending
- `/netlify/functions/daily-summary.ts` - Scheduled function trigger
- `/docs/DAILY_SUMMARY_EMAIL.md` - This documentation

## Support

For issues or questions:
1. Check Netlify function logs
2. Review Resend dashboard for delivery status
3. Test the API endpoint manually
4. Verify all environment variables are set correctly
