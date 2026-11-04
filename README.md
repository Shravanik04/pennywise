Pennywise — Money, made mindful 💸
Pennywise is a personal finance app for tracking expenses, organizing budgets, and understanding spending patterns. Add expenses manually or scan a receipt. Extracted receipt details are presented for review and editing before anything is saved.

🌐 Live app: pennywise-orcin.vercel.app

✨ Features
✍️ Add and manage expenses manually.
🧾 Scan receipt images and PDFs, then review and edit extracted details before saving.
🗂️ Categorize items and view category totals.
🎯 Set monthly budgets and track spending.
🔎 Search expense history and filter by category or start and end dates.
📊 View calculated spending insights and ask questions about saved expenses.
☁️ Use browser-local storage or, when configured, Supabase authentication and account-scoped cloud data.
📅 Filter dashboard totals, category breakdown, spending chart, transactions, and budget progress by this month, previous month, a specific month and year, a year, or an inclusive custom date range. Monthly budget limits are prorated by the calendar days in the selected period.
⚙️ Choose a date format, export expense CSV data, and clear this browser’s Pennywise data from Settings.
🆘 Find setup, receipt scanning, account, privacy, and troubleshooting guidance in Help & support, with a pre-addressed email option for pennywiseapp2026@gmail.com.
🛠️ Tech stack
React
TypeScript
Vite
Supabase Auth, Postgres, and Realtime (optional)
Tesseract.js for image OCR
PDF.js for rendering PDF pages in the browser
🚀 Run locally
Requirements: Node.js 20.19+ or 22.12+.

npm install
npm run dev
Open the local URL shown in the terminal. To create a production build:

npm run build
💾 Storage modes
🖥️ Browser-local mode
Without Supabase configuration, Pennywise runs in local-only mode. Expenses, budgets, recurring-suggestion decisions, receipt files, and app preferences are stored in the current browser using IndexedDB. They persist after refresh and local changes are shared between open tabs on the same origin.

Local data is not backed up or shared between devices or users. Clearing the browser’s site data removes it.

On startup, Pennywise removes only known legacy sample expense IDs. Other saved expenses and budgets are retained.

🔐 Supabase mode
When configured and successfully connected, Pennywise uses Supabase Auth and stores expenses and budgets in the signed-in user’s account. Row Level Security policies restrict access to each user’s own records, and Supabase Realtime delivers expense and budget changes to that user’s open sessions.

Receipt file contents remain on the device where they were uploaded. The receipt filename and type may be saved with the expense, but the original file does not sync between devices.

Existing browser-local expenses and budgets are not automatically copied to Supabase when cloud mode is enabled. They remain in the browser’s local database; cloud-mode views use the signed-in account’s Supabase data.

The date format preference is stored in this browser in either mode and is not synced to Supabase. Settings can export the currently loaded expenses to CSV (receipt files are not included) or clear Pennywise’s local browser database after confirmation. Clearing local data does not delete Supabase account expenses or budgets.

⚙️ Configure Supabase
Create a Supabase project and enable email/password authentication.

Run supabase/migrations/20261028000000_create_expenses.sql in the Supabase SQL Editor, or apply it using the Supabase CLI. The migration creates the expenses and budgets tables, enables Row Level Security, adds per-user policies, and adds both tables to the Realtime publication.

Copy .env.example to .env.local and set the project URL and public key:

VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
In Supabase Authentication → URL Configuration, set the Site URL to your app’s URL and add the app’s local and deployed URLs to the Redirect URLs list. For example:

http://localhost:5173/**
https://pennywise-orcin.vercel.app/**
Use the actual local port shown by Vite if it differs.

Restart the Vite development server. Use the profile menu’s Account security action to sign up or log in. Email confirmation may be required depending on your Supabase Auth settings.

Confirm the app reports that the database and live expense and budget updates are connected. If configuration, database tables, policies, or the realtime subscription cannot be verified, the app reports an error instead of presenting cloud data as connected.

Never put a Supabase service_role or secret key in this frontend. The anon or publishable key is intended for browser use only when the included Row Level Security policies are enabled.

🧾 Receipts and insights
Image receipts are processed in the browser with Tesseract OCR. PDF pages are rendered in the browser with PDF.js before OCR. The first OCR scan downloads Tesseract’s English language data from its public CDN, so an internet connection is needed for that download.

OCR results are suggestions. Merchant, date, total, tax, line items, and categories can be edited, and the user must review and confirm before an expense is saved. Unreadable values remain blank; manual entry is available if scanning fails.

Dashboard totals, category allocations, recurring-payment suggestions, month-end estimates, and Ask Penny answers are calculated from saved expenses. They are not generated by a connected AI service and are not financial advice. Insights may be omitted when there is not enough expense history.

🗓️ Dashboard date filters
Use the Dashboard date menu to choose This month or Previous month, select a specific month and year, or enter a specific year. Choose Custom date range to set both a start and end date; both dates are included. The selected period updates dashboard totals, category breakdown, spending chart, transaction list, and budget progress. Empty periods display an empty state. Budget progress compares period spending with monthly limits prorated by the selected calendar days. These filters use saved expense dates in both browser-local and Supabase modes.

🆘 Help and support
Open Help & support from the sidebar for guidance on expenses, receipts, budgets, account sync, privacy, and common issues. The Contact support section includes a mailto link to pennywiseapp2026@gmail.com with an editable subject and message template. The user’s email app must send the message; Pennywise does not submit support requests. The address can also be copied from the page.

🚀 Deployment
The live app is deployed at https://pennywise-orcin.vercel.app. For another Vercel deployment, configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the Vercel project’s environment variables, then deploy. Add the deployed domain to Supabase’s Authentication redirect URLs.