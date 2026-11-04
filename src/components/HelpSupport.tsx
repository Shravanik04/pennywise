import { BookOpen, CircleHelp, Copy, FileText, LockKeyhole, Mail, ScanLine } from 'lucide-react'
import { useState } from 'react'

type Props = { cloudMode: boolean }
const supportEmail = 'pennywiseapp2026@gmail.com'
const supportSubject = 'Pennywise support request'
const supportBody = 'Hello Pennywise support,\n\nI need help with:\n\nWhat I tried:\n\nThank you.'
const supportMailto = `mailto:${supportEmail}?subject=${encodeURIComponent(supportSubject)}&body=${encodeURIComponent(supportBody)}`

const sections = [
  { id: 'getting-started', label: 'Getting started', icon: BookOpen },
  { id: 'receipt-scanning', label: 'Receipt scanning', icon: ScanLine },
  { id: 'account-sync', label: 'Account and sync', icon: LockKeyhole },
  { id: 'privacy-data', label: 'Privacy and data', icon: FileText },
  { id: 'troubleshooting', label: 'FAQs and troubleshooting', icon: CircleHelp },
  { id: 'contact-support', label: 'Contact support', icon: CircleHelp },
]

export default function HelpSupport({ cloudMode }: Props) {
  const [copyStatus, setCopyStatus] = useState('')
  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(supportEmail)
      setCopyStatus('Email address copied.')
    } catch {
      setCopyStatus('Copy is unavailable here. Select and copy the email address above.')
    }
  }

  return <section className="help-page">
    <header className="help-intro">
      <div><span className="eyebrow">PENNYWISE GUIDE</span><p>Practical guidance for adding expenses, understanding your data, and resolving common issues.</p></div>
      <nav className="help-toc" aria-label="Help page sections">{sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`}><Icon size={16}/><span>{label}</span></a>)}</nav>
    </header>

    <section className="panel help-card" id="getting-started">
      <div className="help-section-heading"><BookOpen size={19}/><h3>Getting started</h3></div>
      <ol className="help-steps">
        <li><b>Add an expense manually</b><span>Open Expenses, choose Add manually, enter the merchant, date, total, and category, then confirm the details to save.</span></li>
        <li><b>Scan a receipt</b><span>Choose Scan a receipt or drop a supported file. Review the OCR suggestions, correct any fields or items, check the confirmation box, and select Confirm and save.</span></li>
        <li><b>Set a category budget</b><span>Open Budgets, add a category and monthly limit, then save. Dashboard budget progress follows the selected date period and prorates monthly limits by the selected calendar days.</span></li>
        <li><b>View spending and insights</b><span>Use the Dashboard date filter for a month, year, or custom dates. Expenses has its own date and category filters. Insights shows saved-expense patterns such as month comparisons and possible recurring payments.</span></li>
      </ol>
    </section>

    <section className="panel help-card" id="receipt-scanning">
      <div className="help-section-heading"><ScanLine size={19}/><h3>Receipt scanning</h3></div>
      <p>Choose JPG/JPEG, PNG, WEBP, BMP, or PDF files up to 15 MB. PDFs may contain up to 20 pages. The app first tries selectable PDF text and otherwise uses English OCR on the PDF pages or image.</p>
      <ul className="help-list">
        <li>On a phone, tap Scan a receipt. If your browser’s file chooser offers Camera or Take photo, choose it and allow camera access when prompted. Camera availability depends on the browser and device; Pennywise does not open the camera directly.</li>
        <li>For blurry, rotated, incomplete, or incorrectly read receipts, take a sharper, well-lit photo, rotate or crop the file using your device, or enter the expense manually.</li>
        <li>OCR output is only a suggestion. Check and edit the merchant, date, amounts, quantities, and categories before confirming; nothing is saved until you confirm.</li>
        <li>If OCR cannot start, check your connection for the one-time English language-data download, then try again or add the expense manually.</li>
      </ul>
    </section>

    <section className="panel help-card" id="account-sync">
      <div className="help-section-heading"><LockKeyhole size={19}/><h3>Account and sync</h3></div>
      {cloudMode ? <p>This app is configured for Supabase. Sign up or log in from the sign-in form. If sign-up asks for email confirmation, open the email link before logging in. Use Forgot password? to request a reset link. To log out, open the profile menu. When signed in, the Supabase connection banner reports whether account data access and live updates are connected.</p> : <p>Supabase is not configured in this build, so Pennywise is in browser-local mode. No account login or cross-device sync is available. The app displays a notice when cloud configuration is missing or invalid.</p>}
      <ul className="help-list">
        <li>In cloud mode, expense details and monthly budgets are stored in the signed-in Supabase account. Receipt files, date-format preferences, and recurring-suggestion decisions stay in this browser.</li>
        <li>In browser-local mode, expenses, budgets, receipt files, preferences, and recurring-suggestion decisions are stored in this browser using IndexedDB. They do not sync to another browser or device.</li>
        <li>If account tables are missing, the project’s included migration at <code>supabase/migrations/20261028000000_create_expenses.sql</code> must be applied to the configured Supabase project. Check the dashboard’s connection banner for database or live-update errors.</li>
        <li>Email confirmation and password-reset links return to the app’s current site address. If a link fails, ask the project owner to allow that address in Supabase Authentication URL configuration, then request a new link.</li>
      </ul>
    </section>

    <section className="panel help-card" id="privacy-data">
      <div className="help-section-heading"><FileText size={19}/><h3>Privacy and data</h3></div>
      <p>{cloudMode ? 'Expense details and budgets are held in Supabase for the signed-in account; receipt files and browser preferences remain on this device.' : 'Expenses, budgets, receipt files, and browser preferences are held in IndexedDB on this device.'} Pennywise does not upload receipt files to Supabase.</p>
      <ul className="help-list">
        <li>To export expenses, open Settings and choose Download expense CSV. The app asks for confirmation; receipt files are not included. In cloud mode, wait until account data has loaded before exporting.</li>
        <li>To remove browser-stored data, open Settings and choose Clear browser data, then confirm. In local-only mode this clears browser expenses and budgets too. In cloud mode it removes this browser’s local data, including receipt files and preferences, but does not delete Supabase expenses or budgets.</li>
      </ul>
    </section>

    <section className="panel help-card" id="troubleshooting">
      <div className="help-section-heading"><CircleHelp size={19}/><h3>FAQs and troubleshooting</h3></div>
      <div className="help-faqs">
        <details><summary>OCR missed or misread receipt details. What should I do?</summary><p>Use a clearer, well-lit, upright image or a supported PDF, then review and edit every suggested field before saving. You can also add the expense manually.</p></details>
        <details><summary>Why is my expense not appearing?</summary><p>Check that you completed the review confirmation. In cloud mode, confirm you are signed into the account where it was saved and wait for the connection banner to verify data access. In local mode, use the same browser and device where the expense was saved. Check the Expenses page’s filters as well.</p></details>
        <details><summary>I did not receive or cannot open a login or email link.</summary><p>Check the email address and spam folder, and request a fresh confirmation or password-reset link. These links return to the app’s current address, which must be allowed in Supabase Authentication URL configuration. Never share your password or a private login link.</p></details>
        <details><summary>Why is Supabase sync unavailable?</summary><p>Cloud mode requires both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to be configured correctly. If the connection banner reports a database error, the project owner should check the included database migration, project availability, and Supabase policies. Do not share keys or account credentials when asking for help.</p></details>
      </div>
    </section>

    <section className="panel help-card help-contact" id="contact-support">
      <div className="help-section-heading"><CircleHelp size={19}/><h3>Contact support</h3></div>
      <p>Need a hand? Email us at <a className="help-contact-address" href={supportMailto}>{supportEmail}</a></p>
      <div className="help-contact-actions"><a className="primary-button help-email-button" href={supportMailto}><Mail size={17}/> Contact support</a><button className="secondary-button" type="button" onClick={() => void copyEmail()}><Copy size={16}/> Copy email address</button></div>
      <p className="help-copy-status" role="status" aria-live="polite">{copyStatus}</p>
      <p className="help-contact-reminder">Do not include passwords, Supabase keys, or other secrets in your message.</p>
    </section>
  </section>
}
