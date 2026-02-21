#!/bin/bash

# Daily Summary Email Feature - Installation Script
# This script installs the required dependencies for the daily summary email feature

echo "📧 Installing Daily Summary Email Dependencies..."
echo ""

# Install main dependencies
echo "Installing resend and @netlify/functions..."
npm install resend
npm install --save-dev @netlify/functions

echo ""
echo "✅ Dependencies installed successfully!"
echo ""
echo "Next steps:"
echo "1. Copy .env.example to .env.local"
echo "2. Add your Resend API key to .env.local"
echo "3. Set DAILY_SUMMARY_EMAIL to your email address"
echo "4. Generate a CRON_SECRET: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
echo "5. Test locally: curl -X POST http://localhost:3000/api/daily-summary -H 'Authorization: Bearer YOUR_CRON_SECRET'"
echo ""
echo "📚 See docs/DAILY_SUMMARY_EMAIL.md for full setup instructions"
