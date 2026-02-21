#!/bin/bash

# ============================================
# SIMPLE EMAIL TEST SETUP
# ============================================

echo ""
echo "📧 Let's set up email testing together!"
echo "========================================"
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ .env.local file not found"
    exit 1
fi

echo "✅ Found .env.local file"
echo ""

# Check current settings
echo "📋 Current Email Settings:"
echo "-------------------------"

if grep -q "RESEND_API_KEY=re_placeholder" .env.local; then
    echo "❌ RESEND_API_KEY: Not set (still placeholder)"
    NEEDS_RESEND=true
else
    echo "✅ RESEND_API_KEY: Set"
    NEEDS_RESEND=false
fi

if grep -q "DAILY_SUMMARY_EMAIL=your-email@example.com" .env.local; then
    echo "❌ DAILY_SUMMARY_EMAIL: Not set (still placeholder)"
    NEEDS_EMAIL=true
else
    echo "✅ DAILY_SUMMARY_EMAIL: Set"
    NEEDS_EMAIL=false
fi

echo ""

if [ "$NEEDS_RESEND" = true ] || [ "$NEEDS_EMAIL" = true ]; then
    echo "⚠️  You need to update some settings first"
    echo ""
    echo "Here's what to do:"
    echo ""
    
    if [ "$NEEDS_RESEND" = true ]; then
        echo "1️⃣  Get a FREE Resend API Key:"
        echo "   • Open this link: https://resend.com"
        echo "   • Click 'Sign Up' (it's free, no credit card)"
        echo "   • After signing up, click 'API Keys'"
        echo "   • Click 'Create API Key'"
        echo "   • Copy the key (starts with 're_')"
        echo ""
        echo "2️⃣  Open your .env.local file and find this line:"
        echo "   RESEND_API_KEY=re_placeholder_get_from_resend_com"
        echo ""
        echo "   Replace it with:"
        echo "   RESEND_API_KEY=re_YourActualKeyHere"
        echo ""
    fi
    
    if [ "$NEEDS_EMAIL" = true ]; then
        echo "3️⃣  In the same .env.local file, find this line:"
        echo "   DAILY_SUMMARY_EMAIL=your-email@example.com"
        echo ""
        echo "   Replace it with your actual email:"
        echo "   DAILY_SUMMARY_EMAIL=youremail@gmail.com"
        echo ""
    fi
    
    echo "4️⃣  Save the .env.local file"
    echo ""
    echo "5️⃣  Run this script again: ./scripts/test-email-simple.sh"
    echo ""
    exit 0
fi

echo "✅ All settings look good!"
echo ""

# Check if dev server is running
echo "🔍 Checking if dev server is running..."
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Dev server is running"
    echo ""
    
    echo "📧 Sending test email..."
    echo ""
    
    # Run the test
    node test-email.js
    
else
    echo "❌ Dev server is NOT running"
    echo ""
    echo "Please start it first:"
    echo "  Terminal 1: npm run dev"
    echo ""
    echo "Then in a NEW terminal window:"
    echo "  Terminal 2: ./scripts/test-email-simple.sh"
    echo ""
fi
