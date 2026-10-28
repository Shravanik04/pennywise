# Pennywise

A React, TypeScript, and Vite personal finance dashboard with receipt OCR, editable expense review, category budgets, calculated insights, and searchable expense history.

## Run locally

1. Install Node.js 20.19+ (or 22.12+).
2. From this project directory, run `npm install`.
3. Run `npm run dev` and open Vite's local URL.
4. Create a production build with `npm run build`.

## Local-only mode

Without Supabase environment variables, Pennywise starts with no expenses or budgets. Expenses, budgets, recurring-suggestion decisions, and receipt files are stored in this browser's IndexedDB. They persist after refresh and local changes are broadcast to other open tabs on the same origin. Browser-local data is not shared with other devices or users and is not backed up. Clearing this site's browser data removes it.

On startup, Pennywise removes only the legacy known sample expense IDs (`sample-1` through `sample-5` and the two `sample-recurring-netflix-*` records). Other saved expenses and budgets are retained.

## Supabase accounts and private data

Sign up, log in, log out, and password recovery use Supabase Auth. Account sign-in and cloud data are disabled until both environment variables are set and a signed-in database connection and realtime subscription succeed. No credentials are committed to the project. Without configuration, local-only expense tracking remains available; open **Settings** for the authentication setup status and steps. No login is simulated.

1. Create a Supabase project and enable email/password authentication.
2. Run [`supabase/migrations/20261028000000_create_expenses.sql`](./supabase/migrations/20261028000000_create_expenses.sql) in the Supabase SQL Editor (or apply it with the Supabase CLI). It creates the `public.expenses` and `public.budgets` tables, enables row-level security, adds per-user policies, and adds both tables to the realtime publication.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the project's URL and public anon/publishable key.
4. In Supabase Auth URL configuration, allow the local Vite origin (for example `http://localhost:5173`) and the deployed app URL as redirect URLs. Keep email confirmation enabled as appropriate for your project.
5. Restart the Vite development server. Use **Settings** to sign up or log in. Email confirmation may be required based on the Supabase Auth settings. Password recovery sends a Supabase email link back to the app; the recovery screen lets the user set a new password.
6. Confirm the app reports that the database and live expense and budget updates are connected. If configuration, the database tables, policies, or subscription cannot be verified, the app displays an error and does not present cloud data as connected.

Expenses and budgets are stored in Supabase for the signed-in user. Row-level security restricts select, insert, update, and delete to that owner's `user_id`. Supabase Realtime listens to both tables, filtered to the signed-in user. Recurring-suggestion decisions and receipt file contents remain in this browser and do not sync between devices. The expense's receipt filename/type may sync, but the original file is local to the device where it was uploaded.

Existing browser-only expenses and budgets are not deleted or automatically copied into a Supabase account when configuration is added. They remain in the browser's local database; cloud-mode views use only the signed-in account's Supabase expenses and budgets.

Never put a Supabase service-role key in this frontend. The public anon/publishable key is intended for browser use only with the included row-level security policies enabled.

## Receipts and calculated insights

Image receipts are read in the browser with Tesseract OCR. PDF pages are rendered locally with PDF.js before OCR. The initial OCR scan downloads Tesseract's English language data from its public CDN. OCR values are suggestions: merchant, date, total, tax, line items, and item categories can be edited, and a user must review and confirm before an expense is saved. Unreadable values remain blank; manual entry remains available if OCR fails.

Dashboard figures, category allocations, recurring-payment suggestions, month-end estimates, and Ask Penny answers are calculations based on the user's saved expenses—not an AI service or financial advice. Comparisons and patterns are omitted or marked as needing more data when the saved history is insufficient.
