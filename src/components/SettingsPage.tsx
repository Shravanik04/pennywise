import { useState } from 'react'
import packageJson from '../../package.json'
import { currency, formatDate, todayKey } from '../finance'
import type { AppPreferences, DateFormat, ExpenseRecord } from '../expenseStore'

type Props = {
  expenses: ExpenseRecord[]
  dateFormat: DateFormat
  cloudMode: boolean
  expensesReady: boolean
  preferencesLoaded: boolean
  dateFormatError: string
  onDateFormatChange: (preferences: AppPreferences) => Promise<void>
  onClearLocalData: () => Promise<void>
  onNotify: (message: string) => void
}

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`
const isDateFormat = (value: string): value is DateFormat => value === 'd-mmm-yyyy' || value === 'dd/mm/yyyy' || value === 'yyyy-mm-dd'

export default function SettingsPage({ expenses, dateFormat, cloudMode, expensesReady, preferencesLoaded, dateFormatError, onDateFormatChange, onClearLocalData, onNotify }: Props) {
  const [savingPreference, setSavingPreference] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const exportExpenses = () => {
    if (!expenses.length) return
    if (!window.confirm(`Download a CSV containing ${expenses.length} saved expense${expenses.length === 1 ? '' : 's'}? Receipt files are not included.`)) return
    setExporting(true)
    try {
      const rows = [
        ['Expense ID', 'Date', 'Merchant', 'Category', 'Amount (INR)', 'Subtotal (INR)', 'Tax (INR)', 'Items'],
        ...expenses.map((expense) => [
          expense.id,
          formatDate(expense.date, dateFormat),
          expense.merchant,
          expense.category,
          expense.amount,
          expense.subtotal ?? '',
          expense.tax ?? '',
          expense.items.map((item) => `${item.quantity ?? 1} × ${item.name} (${currency(item.price)})`).join('; '),
        ]),
      ]
      const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = `pennywise-expenses-${todayKey()}.csv`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      onNotify(`Downloaded ${expenses.length} expense${expenses.length === 1 ? '' : 's'} as CSV.`)
    } catch (error) {
      onNotify(error instanceof Error ? `Could not export expenses: ${error.message}` : 'Could not export expenses.')
    } finally {
      setExporting(false)
    }
  }

  const clearLocalData = async () => {
    const message = cloudMode
      ? 'Clear data stored by Pennywise in this browser, including local expenses, cached receipts, budgets, recurring decisions, and preferences? Your Supabase account expenses and budgets will not be deleted.'
      : 'Permanently clear all Pennywise expenses, receipts, budgets, recurring decisions, and preferences stored in this browser? This cannot be undone.'
    if (!window.confirm(message)) return
    setClearing(true)
    try {
      await onClearLocalData()
      onNotify('Pennywise data stored in this browser was cleared.')
    } catch (error) {
      onNotify(error instanceof Error ? `Could not clear browser data: ${error.message}` : 'Could not clear browser data.')
    } finally {
      setClearing(false)
    }
  }

  const changeDateFormat = async (value: DateFormat) => {
    setSavingPreference(true)
    try {
      await onDateFormatChange({ dateFormat: value })
      onNotify('Date format saved on this browser.')
    } catch (error) {
      onNotify(error instanceof Error ? `Could not save date format: ${error.message}` : 'Could not save date format.')
    } finally {
      setSavingPreference(false)
    }
  }

  return <section className="settings-page">
    <div className="settings-page-heading">
      <div><div className="eyebrow">YOUR PENNYWISE PREFERENCES</div><h2>Settings</h2><p>Choose how dates are displayed and manage your expense data.</p></div>
    </div>
    <section className="panel settings-card">
      <div className="settings-card-heading"><div><h3>Currency and region</h3><p>Currency and regional calculations currently follow the app’s India setup.</p></div></div>
      <div className="settings-static-row"><span>Currency</span><b>Indian Rupee (INR · ₹)</b></div>
      <label className="settings-field"><span>Date format</span><select value={dateFormat} disabled={!preferencesLoaded || savingPreference} onChange={(event) => { if (isDateFormat(event.currentTarget.value)) void changeDateFormat(event.currentTarget.value) }}><option value="d-mmm-yyyy">4 Nov 2026</option><option value="dd/mm/yyyy">04/11/2026</option><option value="yyyy-mm-dd">2026-11-04</option></select></label>
      {dateFormatError && <p className="settings-error" role="alert">{dateFormatError}</p>}
      <p className="settings-storage-note">Date format is saved only in this browser and is not synced to your Supabase account.</p>
    </section>
    <section className="panel settings-card">
      <div className="settings-card-heading"><div><h3>Data and privacy</h3><p>{cloudMode ? 'The CSV contains expenses from your signed-in Supabase account. Receipt files are not included.' : 'The CSV contains expenses saved in this browser. Receipt files are not included.'}</p></div></div>
      {cloudMode && !expensesReady && <p className="settings-storage-note" role="status">{expenses.length ? 'Waiting for account data access to be verified before export.' : 'Sign in and wait for account data to load before exporting cloud expenses.'}</p>}
      <div className="settings-action-row"><div><b>Export expenses</b><span>Download {expenses.length} saved expense{expenses.length === 1 ? '' : 's'} as a CSV file.</span></div><button className="secondary-button" disabled={!expensesReady || !expenses.length || exporting} onClick={exportExpenses}>{exporting ? 'Preparing…' : 'Download expense CSV'}</button></div>
      <div className="settings-action-row settings-destructive-row"><div><b>Clear this browser’s local data</b><span>{cloudMode ? 'Removes local data and receipt files from this browser only. Supabase account data is not deleted.' : 'Permanently removes expenses, receipts, budgets, recurring decisions, and preferences stored in this browser.'}</span></div><button className="secondary-button" disabled={clearing} onClick={() => void clearLocalData()}>{clearing ? 'Clearing…' : 'Clear browser data'}</button></div>
    </section>
    <section className="panel settings-card settings-about">
      <div className="settings-card-heading"><div><h3>About</h3><p>Pennywise · Version {packageJson.version}</p></div></div>
      <p className="settings-storage-note">Help and privacy pages are not available in this app.</p>
    </section>
  </section>
}
