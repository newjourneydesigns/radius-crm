# RADIUS Circle Leader Management System

A comprehensive management system for Circle Leaders built with Next.js, Tailwind CSS, and Supabase.

## Features
- ✅ Circle Leader Management  
- ✅ Dashboard with Filters
- ✅ Connection Tracking

## Deployment Status
✅ Successfully deployed to Netlify with full mobile responsiveness and database integration.

## Features

- 📱 **Mobile-First Design**: Responsive interface optimized for all devices
- 🔍 **Advanced Filtering**: Search and filter by campus, ACPD, status, meeting day, and more
- 👤 **Leader Profiles**: Detailed profiles with contact info, meeting schedules, and notes
- 📊 **Event Tracking**: Monitor event summary submissions and follow-up activities
- 🔄 **Real-Time Updates**: Live data from Supabase with automatic syncing
- 🎨 **Modern UI**: Clean, accessible interface with dark mode support
- 🔐 **Authentication**: Secure login with role-based access control

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Netlify
- **Authentication**: Supabase Auth

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account and project

### Environment Variables
Create a `.env.local` file with:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation
```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

### Viewing the App in Dev Without Supabase (Demo Mode)

If you just want to explore the UI without setting up a Supabase project, enable **Demo Mode**:

1. Copy the example env file:
   ```bash
   cp .env.example .env.local
   ```
2. Set demo mode in `.env.local`:
   ```
   NEXT_PUBLIC_DEMO_MODE=true
   ```
3. Start the dev server:
   ```bash
   npm install
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) — you will be automatically signed in as **Demo User** (ACPD role) and can navigate all pages. A yellow banner at the top of every page reminds you that no real data is connected.

> ⚠️ **Never** set `NEXT_PUBLIC_DEMO_MODE=true` in a production `.env` file — it bypasses all authentication.

## Deployment to Netlify

### Method 1: GitHub Integration (Recommended)

1. **Push to GitHub**:
   ```bash
   git remote add origin https://github.com/yourusername/radius.git
   git push -u origin main
   ```

2. **Deploy on Netlify**:
   - Go to [Netlify](https://netlify.com)
   - Click "Import from Git"
   - Connect your GitHub repository
   - Configure build settings:
     - Build command: `npm run build`
     - Publish directory: `.next`
   - Add environment variables in Netlify dashboard:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Method 2: Netlify CLI

1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Login and Deploy**:
   ```bash
   netlify login
   netlify init
   netlify deploy --prod
   ```

### Build Configuration

The project includes a `netlify.toml` file with optimized settings:
- Next.js plugin for serverless functions
- Environment variable configuration
- Security headers
- Redirect rules

## Project Structure

```
radius/
├── app/                    # Next.js 14 App Router
│   ├── dashboard/          # Dashboard page
│   ├── circle/[id]/        # Dynamic circle leader profiles
│   ├── add-leader/         # Add new leader form
│   ├── login/              # Authentication
│   └── settings/           # User settings
├── components/             # Reusable components
│   ├── dashboard/          # Dashboard-specific components
│   └── layout/             # Layout components
├── hooks/                  # Custom React hooks
├── lib/                    # Utilities and configurations
├── contexts/               # React contexts
└── styles/                 # Global styles
```

## Database Schema

The application uses Supabase with the following main tables:
- `circle_leaders` - Leader information and contact details
- `notes` - Leader-specific notes and follow-ups
- `campuses` - Campus locations
- `acpds` - ACPD information

See `database_schema_073025.sql` for the complete schema.

## Key Features

### Dashboard
- Filter leaders by multiple criteria
- Search functionality
- Event summary progress tracking
- Today's meeting schedule
- Responsive grid layout

### Leader Profiles
- Complete contact information
- Meeting schedules and preferences
- Notes and follow-up tracking
- Event summary status

### Mobile Experience
- Hamburger navigation menu
- Bottom tab navigation
- Touch-optimized interface
- Responsive forms and modals

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is private and proprietary.

## Support

For support and questions, please contact the development team.
