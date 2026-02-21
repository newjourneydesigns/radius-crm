# 🚀 Daily Summary Email - Deployment Checklist

## Pre-Deployment Checklist

### ✅ 1. Package Installation

The following packages have been added to `package.json`:
- ✓ `resend` (dependencies)
- ✓ `@netlify/functions` (devDependencies)

**Run this command:**
```bash
npm install
```

### ✅ 2. Files Created

- ✓ `/lib/emailService.ts` - Email service with HTML template
- ✓ `/app/api/daily-summary/route.ts` - API endpoint (GET/POST)
- ✓ `/netlify/functions/daily-summary.ts` - Scheduled function
- ✓ `/docs/DAILY_SUMMARY_EMAIL.md` - Full documentation
- ✓ `/docs/DAILY_SUMMARY_QUICKSTART.md` - Quick start guide
- ✓ `/.env.example` - Updated with new variables

### ✅ 3. Environment Variables Required

You need to set these up in **TWO** places:

#### A. Local Development (`.env.local`)

```bash
# Copy from example
cp .env.example .env.local

# Then add these values:
RESEND_API_KEY=re_xxxxxxxxxxxxx          # From resend.com
EMAIL_FROM=noreply@yourdomain.com        # Your verified domain
EMAIL_FROM_NAME=Radius CRM               # Display name
DAILY_SUMMARY_EMAIL=your-email@example.com  # Where to send summaries
CRON_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

#### B. Netlify Deployment

1. Go to: **Netlify Dashboard** → Your Site → **Site Settings** → **Environment Variables**
2. Add the same variables as above (use the **same** `CRON_SECRET`)

### ✅ 4. Get Resend API Key

1. Go to [https://resend.com](https://resend.com)
2. Sign up (free: 100 emails/day, 3,000/month)
3. Verify your sending domain (or use test domain)
4. Generate API key from dashboard
5. Copy to your `.env.local` and Netlify

---

## 🎯 Deployment Steps

### Step 1: Install Dependencies

```bash
npm install
```

This will install:
- `resend@^4.0.1`
- `@netlify/functions@^2.8.2`

### Step 2: Test Locally (Optional but Recommended)

```bash
# Start dev server
npm run dev

# In another terminal, test the API
curl http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Send a test email
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Step 3: Commit and Push

```bash
git add .
git commit -m "feat: Add daily summary email feature"
git push origin main
```

### Step 4: Configure Netlify Environment Variables

After push, go to Netlify:

1. **Site Settings** → **Environment Variables** → **Add a variable**
2. Add each variable:
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `EMAIL_FROM_NAME`
   - `DAILY_SUMMARY_EMAIL`
   - `CRON_SECRET`
3. Click **Save**
4. Trigger a redeploy if needed

### Step 5: Verify Scheduled Function

1. Go to **Netlify Dashboard** → Your Site → **Functions**
2. Look for `daily-summary` in the list
3. Check the schedule (should show `0 8 * * *`)
4. Wait for first execution or manually invoke for testing

---

## 📋 Post-Deployment Verification

### Check 1: Function Deployed
- [ ] Go to Netlify Dashboard → Functions
- [ ] Verify `daily-summary` appears in the list
- [ ] Status should be "Active"

### Check 2: Test Email Manually
```bash
curl -X POST https://your-site.netlify.app/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### Check 3: Check Logs
- [ ] Netlify Dashboard → Functions → daily-summary
- [ ] Click on a recent execution
- [ ] Verify no errors in logs

### Check 4: Verify Email Received
- [ ] Check your inbox (set as `DAILY_SUMMARY_EMAIL`)
- [ ] Check spam folder
- [ ] Verify email looks correct

### Check 5: Check Resend Dashboard
- [ ] Go to [Resend Dashboard](https://resend.com/emails)
- [ ] Verify email appears in sent list
- [ ] Check delivery status

---

## 🔧 Troubleshooting

### Issue: TypeScript Errors in IDE

**Cause:** Packages not installed yet

**Fix:**
```bash
npm install
```

Then restart your TypeScript server (VS Code: Cmd+Shift+P → "TypeScript: Restart TS Server")

### Issue: Empty Email Received

**Cause:** No data meets the criteria

**Fix:** Ensure you have:
1. Circle leader with `follow_up_required = true`
2. `follow_up_date` is today or earlier
3. Overdue todos mentioning leader names
4. Planned encouragements for today

### Issue: No Email Received

**Possible causes:**
1. Check Netlify function logs for errors
2. Verify `RESEND_API_KEY` is correct
3. Check `DAILY_SUMMARY_EMAIL` is set
4. Verify sender domain in Resend
5. Check spam folder

### Issue: Unauthorized (401) Error

**Cause:** `CRON_SECRET` mismatch

**Fix:** Ensure `CRON_SECRET` is:
1. The same in `.env.local` and Netlify
2. Properly set in both places
3. Used in Authorization header as `Bearer YOUR_SECRET`

### Issue: Function Not Running on Schedule

**Possible causes:**
1. Netlify scheduled functions may take time to activate
2. Check Netlify Functions dashboard
3. Verify the cron expression is correct
4. Try manual invocation first

---

## 📅 Default Schedule

**Current Schedule:** Daily at 8:00 AM UTC

**In US Time Zones:**
- 2:00 AM CST (Central Standard Time)
- 3:00 AM CDT (Central Daylight Time)
- 3:00 AM EST (Eastern Standard Time)
- 4:00 AM EDT (Eastern Daylight Time)

**To Change:** Edit `/netlify/functions/daily-summary.ts` line 9:
```typescript
const handler = schedule('0 8 * * *', async (event) => {
```

**Cron Examples:**
- `0 12 * * *` = 12:00 PM UTC (6-7 AM US Central)
- `0 7 * * 1-5` = 7:00 AM UTC weekdays only
- `0 14 * * *` = 2:00 PM UTC (8-9 AM US Central)

---

## 🎉 Success Criteria

You'll know it's working when:

- [ ] `npm install` completes without errors
- [ ] No TypeScript errors in the three main files
- [ ] Local test sends email successfully
- [ ] Git push triggers Netlify deployment
- [ ] Function appears in Netlify Functions dashboard
- [ ] Environment variables are set in Netlify
- [ ] Manual API test returns success
- [ ] First scheduled email arrives on time
- [ ] Email content is accurate and formatted well

---

## 📚 Next Steps After Deployment

1. **Monitor First Email:** Wait for tomorrow morning's scheduled email
2. **Adjust Schedule:** Change timing if needed
3. **Add More Recipients:** Update `DAILY_SUMMARY_EMAIL` with comma-separated emails
4. **Customize Template:** Edit `/lib/emailService.ts` for branding
5. **Set Up Alerts:** Configure Netlify notifications for function failures

---

## 🆘 Need Help?

1. Check full documentation: `/docs/DAILY_SUMMARY_EMAIL.md`
2. Review quick start: `/docs/DAILY_SUMMARY_QUICKSTART.md`
3. Check Netlify function logs
4. Verify Resend dashboard
5. Test API endpoint manually

---

## 📝 Manual Installation Commands

If the automated script fails, run these manually:

```bash
# 1. Install dependencies
npm install resend @netlify/functions

# 2. Generate CRON_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Copy environment variables
cp .env.example .env.local

# 4. Edit .env.local with your values
# (RESEND_API_KEY, EMAIL_FROM, DAILY_SUMMARY_EMAIL, CRON_SECRET)

# 5. Test locally
npm run dev

# 6. In another terminal
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# 7. Commit and push
git add .
git commit -m "feat: Add daily summary email feature"
git push

# 8. Configure Netlify environment variables via dashboard
```

---

**Ready to deploy? Follow the steps above! 🚀**
