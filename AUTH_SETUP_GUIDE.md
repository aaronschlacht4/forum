# User Authentication & Database Annotations Setup Guide

This guide will help you set up user accounts and database-backed annotations for your PDF viewer.

## Step 1: Set Up Supabase Database

### 1.1 Run the Database Migration

Go to your Supabase project dashboard:
1. Navigate to https://supabase.com/dashboard
2. Select your project (`tpvpvvmtgfxheceliyxj`)
3. Go to **SQL Editor** in the left sidebar
4. Click **New query**
5. Copy and paste the contents of `supabase-setup.sql`
6. Click **Run** to execute the migration

This will create:
- `annotations` table to store user annotations
- Row-level security policies (users can only see their own data)
- Indexes for fast queries
- Automatic timestamp updates

### 1.2 Enable Email Authentication

1. In Supabase Dashboard, go to **Authentication** > **Providers**
2. Make sure **Email** is enabled
3. Configure email templates (optional but recommended):
   - Go to **Authentication** > **Email Templates**
   - Customize the confirmation email template

## Step 2: Install Required Dependencies

```bash
npm install @supabase/auth-helpers-nextjs @supabase/supabase-js
```

## Step 3: Wrap Your App with AuthProvider

Update your root layout file to include the AuthProvider:

### app/layout.tsx

```typescript
import { AuthProvider } from '@/lib/AuthContext';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

## Step 4: Update PDFViewer Component

The PDFViewer component needs to be updated to use database storage instead of localStorage. Here's what needs to change:

### Key Changes:

1. **Import auth and database functions**
```typescript
import { useAuth } from '@/lib/AuthContext';
import { loadAnnotations, saveAnnotation, deleteAnnotation, deleteAnnotations } from '@/lib/annotations';
```

2. **Replace localStorage with database calls**
   - On component mount: Load annotations from database
   - On annotation create: Save to database
   - On annotation delete: Delete from database

3. **Add authentication check**
   - Show login prompt if user is not authenticated
   - Only allow annotations when logged in

## Step 5: Add Login/Logout UI

### Example: Add auth button to your home page

```typescript
'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import AuthModal from '@/components/AuthModal';

export default function HomePage() {
  const { user, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <div>
      <nav>
        {user ? (
          <div>
            <span>Welcome, {user.email}</span>
            <button onClick={signOut}>Sign Out</button>
          </div>
        ) : (
          <button onClick={() => setShowAuthModal(true)}>
            Sign In
          </button>
        )}
      </nav>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}
```

## Step 6: Test the Setup

1. **Start your dev server**
```bash
npm run dev
```

2. **Create a test account**
   - Click "Sign In" button
   - Switch to "Sign Up" tab
   - Enter email and password (min 6 characters)
   - Check your email for confirmation link (if email confirmation is enabled)

3. **Test annotations**
   - Open a PDF
   - Create some highlights
   - Refresh the page - annotations should persist
   - Sign out and sign back in - annotations should still be there

## Step 7: Migration from localStorage (Optional)

If users already have annotations in localStorage, you can create a migration script:

```typescript
async function migrateLocalStorageAnnotations(bookId: string) {
  const { user } = useAuth();
  if (!user) return;

  const stored = localStorage.getItem(`annotations-${bookId}`);
  if (!stored) return;

  const annotations = JSON.parse(stored);

  for (const annotation of annotations) {
    await saveAnnotation(bookId, annotation);
  }

  // Remove from localStorage after successful migration
  localStorage.removeItem(`annotations-${bookId}`);
}
```

## Troubleshooting

### Common Issues:

1. **"User not authenticated" errors**
   - Make sure AuthProvider wraps your entire app
   - Check that user is signed in before making annotations

2. **Annotations not saving**
   - Check browser console for errors
   - Verify Supabase policies are set up correctly
   - Make sure Row Level Security is enabled

3. **Can't sign up/sign in**
   - Check Supabase dashboard for auth errors
   - Verify email provider is enabled
   - Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local

4. **CORS errors**
   - Add your localhost URL to Supabase's allowed origins:
     - Go to Authentication > URL Configuration
     - Add `http://localhost:3000` to Site URL and Redirect URLs

## Security Notes

- ✅ Row Level Security ensures users can only access their own annotations
- ✅ Service role key is only used server-side (never exposed to client)
- ✅ Anonymous key is safe to expose (it only has limited permissions)
- ✅ Passwords are hashed by Supabase automatically
- ✅ All database queries require authentication

## Next Steps

Once authentication is working, you can:
- Add password reset functionality
- Add social auth (Google, GitHub, etc.)
- Add user profiles
- Add sharing capabilities
- Add collaborative annotations
- Export annotations to PDF

## Files Created

- `lib/supabase.ts` - Client-side Supabase client
- `lib/AuthContext.tsx` - Auth context and hooks
- `lib/annotations.ts` - Database operations for annotations
- `components/AuthModal.tsx` - Login/signup UI
- `supabase-setup.sql` - Database migration script
- `AUTH_SETUP_GUIDE.md` - This guide

## Need Help?

If you run into issues:
1. Check the Supabase dashboard logs
2. Check browser console for errors
3. Verify all environment variables are set
4. Make sure the SQL migration ran successfully
