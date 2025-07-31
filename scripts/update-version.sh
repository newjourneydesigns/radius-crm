#!/bin/bash

# Get the version from package.json
VERSION=$(node -p "require('./package.json').version")

# Update .env.local with the new version
if [ -f ".env.local" ]; then
    # Remove existing NEXT_PUBLIC_APP_VERSION line if it exists
    grep -v "NEXT_PUBLIC_APP_VERSION" .env.local > .env.local.tmp && mv .env.local.tmp .env.local
    # Add the new version
    echo "NEXT_PUBLIC_APP_VERSION=$VERSION" >> .env.local
else
    # Create .env.local if it doesn't exist
    echo "NEXT_PUBLIC_APP_VERSION=$VERSION" > .env.local
fi

# Update service worker cache name with new version
if [ -f "public/sw.js" ]; then
    sed -i.bak "s/const CACHE_NAME = 'radius-v[^']*'/const CACHE_NAME = 'radius-v$VERSION'/" public/sw.js
    rm -f public/sw.js.bak
fi

echo "Updated app version to $VERSION"
