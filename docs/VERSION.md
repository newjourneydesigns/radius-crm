# Version Management

This project uses automated version management with the following features:

## Automatic Version Updates

- The app version is automatically updated from `package.json` 
- The version is displayed in the footer
- A pre-push Git hook ensures the version is always current

## Manual Version Updates

To manually update the version, use these npm scripts:

```bash
# Patch version (1.0.0 -> 1.0.1)
npm run version:patch

# Minor version (1.0.0 -> 1.1.0)  
npm run version:minor

# Major version (1.0.0 -> 2.0.0)
npm run version:major
```

## How It Works

1. `package.json` contains the source of truth for the version
2. `scripts/update-version.sh` reads the version and updates environment variables
3. The Footer component displays the version from `NEXT_PUBLIC_APP_VERSION`
4. Git pre-push hook automatically runs the version update script

## Environment Variables

The version is stored in `.env.local` as:
```
NEXT_PUBLIC_APP_VERSION=1.0.0
```

This allows the client-side component to access the version number.
