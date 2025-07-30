# RADIUS - Circle Leader Management System

A modern Next.js application for managing Circle Leaders with Supabase backend.

## Features

- **Dashboard**: Overview of all Circle Leaders with filtering and search
- **Event Summary Tracking**: Monitor which leaders have submitted event summaries
- **Notes System**: Add and track notes for each Circle Leader
- **Contact Management**: Store and access contact information
- **User Authentication**: Secure login/logout with Supabase Auth
- **Dark Mode Support**: Modern, responsive design with dark theme
- **Real-time Updates**: Live data synchronization with Supabase

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS v3
- **Backend**: Supabase (PostgreSQL, Auth, Real-time)
- **Deployment**: Vercel-ready

## Setup Instructions

### 1. Prerequisites

- Node.js 18+ installed
- A Supabase account and project

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor in your Supabase dashboard
3. Run the schema script: Copy and paste the contents of `supabase/schema.sql`
4. Run the seed script: Copy and paste the contents of `supabase/seed.sql`
5. Get your project credentials:
   - Go to Settings > API
   - Copy your project URL and anon key

### 3. Environment Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy the environment file:
   ```bash
   cp .env.example .env.local
   ```
4. Update `.env.local` with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 4. Create Admin User

1. Go to Authentication > Users in your Supabase dashboard
2. Create a new user or sign up through the app
3. In the SQL Editor, run:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';
   ```

### 5. Run the Application

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── dashboard/         # Dashboard page
│   ├── login/            # Login page
│   ├── add-leader/       # Add leader form
│   ├── circle/[id]/      # Circle leader profile
│   └── ...
├── components/           # Reusable React components
│   └── dashboard/       # Dashboard-specific components
├── contexts/            # React contexts (Auth)
├── hooks/              # Custom React hooks
├── lib/                # Utility libraries
│   └── supabase.ts    # Supabase client configuration
├── styles/             # Global styles
├── supabase/          # Database schema and seeds
└── ...
```

## Database Schema

### Tables

- **users**: User profiles and roles
- **circle_leaders**: Circle Leader information
- **notes**: Notes attached to Circle Leaders

### Key Features

- Row Level Security (RLS) enabled
- Automatic user profile creation
- Role-based permissions (admin/user)
- Timestamp tracking with auto-update triggers

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Key Components

- **Dashboard**: Main interface with filtering and leader management
- **FilterPanel**: Advanced filtering for Circle Leaders
- **CircleLeaderCard**: Individual leader display component
- **ContactModal**: Contact information modal
- **EventSummaryProgress**: Progress tracking component

### Custom Hooks

- **useDashboardFilters**: Manage filter state with localStorage persistence
- **useCircleLeaders**: Handle Circle Leader data operations with Supabase

## Deployment

This app is ready for deployment on Vercel:

1. Push your code to GitHub
2. Connect your repo to Vercel
3. Add your environment variables in Vercel dashboard
4. Deploy!

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions, please open a GitHub issue or contact the development team.
