# Passwordless Authentication Migration Guide

## Overview

This document explains the migration from email/password + Google OAuth to an invite-only, passwordless magic link authentication system using Supabase.

## What Changed

### Authentication Flow
- **Before**: Users could sign up with email/password or Google OAuth
- **After**: Invite-only system where admins create users and send magic link invites

### Key Changes
1. ✅ Login page now only asks for email (no password field)
2. ✅ Removed Google OAuth button 
3. ✅ Auth uses `signInWithOtp()` instead of `signInWithPassword()`
4. ✅ User creation via admin API sends automatic invite emails
5. ✅ Login rejects emails not in the system
6. ✅ Maintains role system (ACPD, Viewer)
7. ✅ Preserves RLS policies

### Modified Files
- `app/login/page.tsx` - Updated to magic link login form
- `contexts/AuthContext.tsx` - Removed password/OAuth methods, added `signInWithMagicLink()`
- `app/api/users/route.ts` - Updated POST endpoint to create passwordless users
- `app/users/page.tsx` - Removed password fields, updated UI for invites

## Required Supabase Dashboard Settings

### 1. Disable Public Signups

Navigate to: **Authentication > Providers > Email**

```
Settings:
- Enable email provider: ✅ ON
- Confirm email: ✅ ON (recommended)
- Secure email change: ✅ ON (recommended)
- Enable sign ups: ❌ OFF (CRITICAL - disables public registration)
```

**Important**: With "Enable sign ups" OFF, only admin-created users can sign in.

### 2. Configure Magic Link Settings

Navigate to: **Authentication > Email Templates**

Customize the "Magic Link" template:
- **Subject**: "Sign in to RADIUS CRM"
- **Template**: Customize the email body to match your branding
- The `{{ .ConfirmationURL }}` variable contains the magic link

Example template:
```html
<h2>Welcome to RADIUS</h2>
<p>Click the button below to sign in to your account:</p>
<a href="{{ .ConfirmationURL }}">Sign In</a>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

### 3. Configure Redirect URLs

Navigate to: **Authentication > URL Configuration**

Add your allowed redirect URLs:
```
http://localhost:3000/auth/callback
http://localhost:3001/auth/callback
https://yourdomain.com/auth/callback
https://www.yourdomain.com/auth/callback
```

### 4. (Optional) Rate Limiting

Navigate to: **Authentication > Rate Limits**

Configure magic link rate limits to prevent abuse:
- **Email send rate**: 4 per hour (recommended)
- **OTP verification rate**: 10 per hour

### 5. Remove Google OAuth Provider (Optional)

Navigate to: **Authentication > Providers > Google**

```
Settings:
- Enable Google provider: ❌ OFF
```

If you want to completely remove Google OAuth:
1. Turn off the provider
2. Remove any Google OAuth redirect URLs
3. Delete Google OAuth credentials

## Migration Steps

### Step 1: Backup Current Users

```bash
# Optional: Export existing users from Supabase
# Go to Supabase Dashboard > Authentication > Users > Export
```

### Step 2: Update Supabase Settings

Follow the "Required Supabase Dashboard Settings" section above.

### Step 3: Deploy Code Changes

All code changes are already implemented:
- Login page updated
- AuthContext updated
- User management updated
- API endpoints updated

### Step 4: Notify Existing Users

Send an email to all existing users explaining:
1. Authentication has changed to magic links
2. They'll receive an email with a sign-in link
3. No password is required
4. They should bookmark the login page

### Step 5: Re-invite Existing Users (If Needed)

If you want to ensure all users get the new magic link:

```sql
-- Run this in Supabase SQL Editor to get all user emails
SELECT email FROM auth.users;
```

Then use the admin panel to "re-invite" users:
1. Go to `/users` in the app (admin only)
2. Users are already in the system, they just need to sign in with magic link

### Step 6: Test the Flow

1. **Test Login**:
   - Go to `/login`
   - Enter an invited email
   - Check email for magic link
   - Click link and verify sign-in works

2. **Test Unauthorized Access**:
   - Try to sign in with a non-invited email
   - Should see: "Access denied. Only invited users can sign in."

3. **Test Admin User Creation**:
   - Go to `/users` (admin only)
   - Click "Add New User"
   - Enter email, name, and role
   - Click "Send Invite"
   - Verify user receives invite email

## Security Considerations

### ✅ Improved Security
- **No passwords to leak**: Passwords are a common attack vector
- **Phishing resistant**: Magic links expire after 1 hour
- **Rate limited**: Built-in protection against brute force
- **Invite-only**: Only admins can create new users

### 🔒 Security Best Practices
1. **Keep service role key secret**: Never expose in client-side code
2. **Monitor failed sign-ins**: Check Supabase logs for suspicious activity
3. **Use HTTPS in production**: Required for secure magic links
4. **Set appropriate magic link expiry**: Default is 1 hour (adjust in Supabase settings)
5. **Email validation**: System validates email format before sending magic links

### 🚨 Important Notes
- Magic links can only be used once
- Magic links expire after 1 hour (configurable in Supabase)
- Users must have access to their email to sign in
- Can't sign in if email provider is down

## Troubleshooting

### Users Not Receiving Magic Links

**Check**:
1. Supabase email provider is configured
2. Email isn't in spam folder
3. SMTP settings are correct in Supabase
4. Rate limits haven't been exceeded

**Solution**: In Supabase Dashboard > Authentication > Settings, verify SMTP configuration.

### "User Not Found" Error

**Check**:
1. User exists in Supabase auth.users table
2. User was created via admin API (not manually in Supabase)
3. Email address matches exactly (case-insensitive)

**Solution**: Admin should re-invite the user via `/users` page.

### Magic Link Redirects to Wrong URL

**Check**:
1. Redirect URLs are configured in Supabase
2. `emailRedirectTo` matches allowed URLs
3. Production URL is in the allowed list

**Solution**: Add missing URLs in Supabase > Authentication > URL Configuration.

### Admin Can't Create Users

**Check**:
1. User has ACPD role in database
2. Service role key is set in `.env.local`
3. `/api/users` endpoint is accessible

**Solution**: Verify `SUPABASE_SERVICE_ROLE_KEY` in environment variables.

## Rollback Plan

If you need to revert to the old authentication:

1. **Re-enable password authentication** in Supabase:
   - Authentication > Providers > Email
   - Enable sign ups: ✅ ON

2. **Restore old code**:
   ```bash
   git revert <commit-hash>
   # Or manually restore from backup
   ```

3. **Reset user passwords**: Use Supabase dashboard to force password reset for all users

## API Reference

### User Invitation API

**Endpoint**: `POST /api/users`

**Request**:
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "Viewer"
}
```

**Response**:
```json
{
  "message": "User invited successfully. They will receive an email with a magic link to sign in.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### Magic Link Sign In

**Method**: Client-side via Supabase

```typescript
const { error } = await supabase.auth.signInWithOtp({
  email: email.trim().toLowerCase(),
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
    shouldCreateUser: false  // Only allow existing users
  }
});
```

## Support

For questions or issues:
- Check Supabase auth logs: Dashboard > Logs > Auth
- Review this document
- Contact system administrator

---

**Last Updated**: February 22, 2026  
**Migration Status**: ✅ Complete  
**Authentication Type**: Magic Link (OTP)  
**User Management**: Invite-only by admins
