#!/bin/bash

# ============================================
# Daily Summary Email - Deployment Script
# ============================================

echo "🚀 Daily Summary Email - Deployment Checklist"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if dependencies are installed
echo "📦 Step 1: Installing Dependencies..."
echo "-----------------------------------"
npm install resend @netlify/functions
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dependencies installed successfully${NC}"
else
    echo -e "${RED}✗ Failed to install dependencies${NC}"
    exit 1
fi
echo ""

# Check if .env.local exists
echo "🔐 Step 2: Checking Environment Variables..."
echo "-------------------------------------------"
if [ ! -f .env.local ]; then
    echo -e "${YELLOW}⚠ .env.local not found${NC}"
    echo "Creating .env.local from .env.example..."
    cp .env.example .env.local
    echo -e "${YELLOW}⚠ Please update .env.local with your actual values:${NC}"
    echo "  - RESEND_API_KEY"
    echo "  - EMAIL_FROM"
    echo "  - DAILY_SUMMARY_EMAIL"
    echo "  - CRON_SECRET"
else
    echo -e "${GREEN}✓ .env.local exists${NC}"
fi
echo ""

# Check if required environment variables are set
if [ -f .env.local ]; then
    source .env.local
    
    if [ -z "$RESEND_API_KEY" ] || [ "$RESEND_API_KEY" = "re_xxxxxxxxxxxxx" ]; then
        echo -e "${YELLOW}⚠ RESEND_API_KEY not configured${NC}"
    else
        echo -e "${GREEN}✓ RESEND_API_KEY is set${NC}"
    fi
    
    if [ -z "$DAILY_SUMMARY_EMAIL" ] || [ "$DAILY_SUMMARY_EMAIL" = "your-email@example.com" ]; then
        echo -e "${YELLOW}⚠ DAILY_SUMMARY_EMAIL not configured${NC}"
    else
        echo -e "${GREEN}✓ DAILY_SUMMARY_EMAIL is set${NC}"
    fi
    
    if [ -z "$CRON_SECRET" ] || [ "$CRON_SECRET" = "your_random_secret_here" ]; then
        echo -e "${YELLOW}⚠ CRON_SECRET not configured${NC}"
        echo "Generating a CRON_SECRET for you..."
        NEW_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
        echo "CRON_SECRET=$NEW_SECRET"
        echo "Save this to your .env.local and Netlify environment variables!"
    else
        echo -e "${GREEN}✓ CRON_SECRET is set${NC}"
    fi
fi
echo ""

# Check for compilation errors
echo "🔍 Step 3: Checking for TypeScript Errors..."
echo "------------------------------------------"
npm run build --if-present 2>&1 | grep -i "error" | head -5 || echo -e "${GREEN}✓ No critical errors found${NC}"
echo ""

# Git status
echo "📝 Step 4: Git Status..."
echo "----------------------"
git status --short
echo ""

# Deployment instructions
echo "🎯 Step 5: Ready to Deploy!"
echo "-------------------------"
echo ""
echo "Local Testing:"
echo "  1. npm run dev"
echo "  2. curl -X POST http://localhost:3000/api/daily-summary \\"
echo "       -H 'Authorization: Bearer \$CRON_SECRET'"
echo ""
echo "Deploy to Netlify:"
echo "  1. git add ."
echo "  2. git commit -m 'Add daily summary email feature'"
echo "  3. git push"
echo ""
echo "After Deployment:"
echo "  1. Go to Netlify Dashboard > Site Settings > Environment Variables"
echo "  2. Add these variables:"
echo "     - RESEND_API_KEY"
echo "     - EMAIL_FROM"
echo "     - EMAIL_FROM_NAME"
echo "     - DAILY_SUMMARY_EMAIL"
echo "     - CRON_SECRET"
echo "  3. Redeploy if needed"
echo "  4. Check Netlify Functions > daily-summary for execution logs"
echo ""
echo -e "${GREEN}=============================================="
echo "✓ Deployment preparation complete!"
echo -e "==============================================\${NC}"
