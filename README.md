# LEU Build Planner

A responsive weekly build planner modeled after the supplied screenshot.

## Features

- Five-week schedule view with previous/next navigation
- Add, edit, remove, and drag-and-drop schedule cards
- Viewer mode is read-only
- Admin sign-in with Supabase email/password authentication
- Shared team data through Supabase Postgres
- JSON import/export
- Browser-only demo fallback when Supabase is not configured

## Run locally

No build process is required. In this folder run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

Without Supabase values, the app runs in demo mode and stores data in the current browser only.

## Configure shared team data

1. Create a Supabase project.
2. Open the SQL Editor and run `supabase.sql`.
3. In Authentication, create each administrator as an email/password user. Everyone else can use the public viewer link without signing in.
4. Edit `config.js` and enter the project URL and publishable/anon key.
5. Reload the site.

Security model: anonymous users can read the schedule; only authenticated users can modify it. Never put a Supabase secret/service-role key in `config.js` or any browser file.

## Deploy on Vercel

1. Push this folder to GitHub, GitLab, or Bitbucket.
2. Import the repository in Vercel.
3. Select **Other** as the framework preset. Leave the build command empty and set the output directory to `.`.
4. Deploy and share the generated URL with the team.

## Deploy on Netlify

1. Push the project to a Git provider and create a site from the repository.
2. Leave the build command empty and set the publish directory to `.`.
3. Deploy and share the site URL.

You can also drag the whole folder into Netlify Drop for a quick static deployment.

## Production hardening

The included RLS policies treat every authenticated account as an administrator. For a larger organization, add a `profiles` or `admin_users` table and restrict write policies to an explicit admin role or approved email domain.
