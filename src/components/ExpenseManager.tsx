import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, ArrowDownToLine, ArrowLeft, Check, ChevronDown, Eye, FileImage, FileText, LoaderCircle, Pencil, Plus, ReceiptText, Search, Trash2, Upload, X } from 'lucide-react'
import { categoryAllocations, formatDate, todayKey } from '../finance'
import type { ReceiptDraft, ReceiptItem } from '../receiptOcr'
import type { DateFormat, ExpenseRecord } from '../expenseStore'

const money = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const categories = ['Food & drink', 'Groceries', 'Personal Care', 'Transport', 'Shopping', 'Bills', 'Health', 'Subscriptions', 'Other', 'Mixed']
const dateLabel = (date: string, format: DateFormat) => date ? formatDate(date, format) : 'Date needed'
const toneFor = (category: string) => ({ 'Food & drink': 'peach', Groceries: 'mint', 'Personal Care': 'peach', Transport: 'lavender', Shopping: 'peach', Bills: 'lavender', Health: 'mint', Subscriptions: 'rose', Other: 'mint' }[category] ?? 'mint')
const iconFor = (category: string) => ({ 'Food & drink': '🍽', Groceries: '🥑', 'Personal Care': '🧴', Transport: '🚕', Shopping: '🛍', Bills: '💡', Health: '🩺', Subscriptions: '🎬', Other: '🧾' }[category] ?? '🧾')

type Props = { expenses: ExpenseRecord[]; cloudMode: boolean; dateFormat: DateFormat; onSave: (expense: ExpenseRecord, file?: File) => Promise<void>; onDelete: (id: string) => Promise<void>; onOpenFile: (id: string) => Promise<void>; onNotify: (message: string) => void }
type Flow = 'idle' | 'processing' | 'review' | 'manual' | 'detail' | 'edit'

export default function ExpenseManager({ expenses, cloudMode, dateFormat, onSave, onDelete, onOpenFile, onNotify }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const deleteDialogRef = useRef<HTMLElement>(null)
  const [flow, setFlow] = useState<Flow>('idle')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('Preparing receipt…')
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<ReceiptDraft | null>(null)
  const [draftFile, setDraftFile] = useState<File | undefined>()
  const [draftId, setDraftId] = useState<string | null>(null)
  const [reviewed, setReviewed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ExpenseRecord | null>(null)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('All categories')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)

  const filtered = useMemo(() => expenses.filter((expense) => {
    const text = `${expense.merchant} ${expense.items.map((item) => item.name).join(' ')}`.toLowerCase()
    const matchesCategory = filterCategory === 'All categories' || expense.category === filterCategory || expense.items.some((item) => item.category === filterCategory)
    return text.includes(search.trim().toLowerCase()) && matchesCategory && (!fromDate || expense.date >= fromDate) && (!toDate || expense.date <= toDate)
  }), [expenses, search, filterCategory, fromDate, toDate])
  const itemSum = draft?.items.reduce((sum, item) => sum + (Number(item.price) || 0), 0) ?? 0
  const categorySplit = useMemo(() => {
    const totals = new Map<string, number>()
    if (!draft || !draft.total || draft.total <= 0) return []
    categoryAllocations({ amount: draft.total, subtotal: draft.subtotal, items: draft.items, category: draft.category }).forEach(({ category, amount }) => totals.set(category, (totals.get(category) ?? 0) + amount))
    return [...totals].sort((a, b) => b[1] - a[1])
  }, [draft?.items, draft?.total, draft?.subtotal, draft?.category])
  const detailCategorySplit = useMemo(() => {
    const totals = new Map<string, number>()
    if (selected) categoryAllocations(selected).forEach(({ category, amount }) => totals.set(category, (totals.get(category) ?? 0) + amount))
    return [...totals].sort((a, b) => b[1] - a[1])
  }, [selected])
  const consistencyWarning = useMemo(() => {
    if (!draft) return ''
    if (flow === 'manual' && draft.items.length === 0) return ''
    const matches = (left: number, right: number) => Math.abs(left - right) <= 0.02
    if (draft.subtotal !== null && draft.tax !== null && draft.total !== null && !matches(draft.subtotal + draft.tax, draft.total)) {
      return `Subtotal plus tax is ${money(draft.subtotal + draft.tax)}, but the receipt total is ${money(draft.total)}. Check these values against the receipt.`
    }
    if (draft.items.length === 0 || draft.total === null) return ''
    const matchesReceiptTotal = matches(itemSum, draft.total)
    const matchesSubtotal = draft.subtotal !== null && matches(itemSum, draft.subtotal)
    if (matchesReceiptTotal || matchesSubtotal) return ''
    return `The ${draft.items.length} detected item amounts add up to ${money(itemSum)}, which matches neither the receipt total${draft.subtotal !== null ? ' nor the subtotal' : ''}. Check the item count and amounts.`
  }, [draft, flow, itemSum])

  const startScan = async (file?: File) => {
    setError('')
    setReviewed(false)
    if (!file) return
    if (!(['image/jpeg', 'image/png', 'image/webp', 'image/bmp'].includes(file.type) || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
      setError('Unsupported file type. Choose a JPG, PNG, WEBP, or PDF receipt.')
      return
    }
    setDraftFile(file)
    setDraftId(crypto.randomUUID())
    setFlow('processing')
    setProgress(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? 'Preparing PDF pages…' : 'Preparing image…')
    try {
      const { scanReceipt } = await import('../receiptOcr')
      const result = await scanReceipt(file, setProgress)
      setDraft(result)
      setFlow('review')
    } catch (caught) {
      setFlow('idle')
      setDraftId(null)
      setError(caught instanceof Error ? caught.message : 'OCR could not read this receipt. Try a clearer image or enter the expense manually.')
    }
  }

  const openEdit = (expense: ExpenseRecord) => {
    setSelected(expense)
    setEditingId(expense.id)
    setDraftId(expense.id)
    setDraft({ merchant: expense.merchant, date: expense.date, category: expense.category, subtotal: expense.subtotal, tax: expense.tax, total: expense.amount, items: expense.items.map((item) => ({ ...item })), warnings: [], rawText: '' })
    setDraftFile(undefined)
    setReviewed(true)
    setFlow('edit')
  }

  const startManualExpense = () => {
    setError('')
    setSelected(null)
    setEditingId(null)
    setDraftId(crypto.randomUUID())
    setDraftFile(undefined)
    setDraft({ merchant: '', date: todayKey(), category: 'Other', subtotal: null, tax: null, total: null, items: [], warnings: [], rawText: '' })
    setReviewed(false)
    setFlow('manual')
  }

  const updateDraft = (key: keyof ReceiptDraft, value: string | number | null) => {
    setReviewed(false)
    setDraft((current) => current ? { ...current, [key]: value } : current)
  }
  const updateItem = (id: string, key: keyof ReceiptItem, value: string | number | undefined) => {
    setReviewed(false)
    setDraft((current) => current ? { ...current, items: current.items.map((item) => {
      if (item.id !== id) return item
      if (key === 'quantity') return { ...item, quantity: value === undefined ? undefined : Number(value) }
      if (key === 'price') return { ...item, price: Number(value) }
      if (key === 'name') return { ...item, name: String(value ?? '') }
      return { ...item, category: String(value ?? 'Other') }
    }) } : current)
  }
  const addItem = () => setDraft((current) => current ? { ...current, items: [...current.items, { id: crypto.randomUUID(), name: '', price: 0, category: current.category !== 'Mixed' ? current.category || 'Other' : 'Other' }] } : current)
  const removeItem = (id: string) => setDraft((current) => current ? { ...current, items: current.items.filter((item) => item.id !== id) } : current)

  const saveDraft = async () => {
    if (!draft || !draft.merchant.trim() || !draft.date || draft.total === null || !Number.isFinite(Number(draft.total)) || Number(draft.total) <= 0) return
    if (!reviewed) return
    setBusy(true)
    try {
      const wasManual = flow === 'manual'
      const itemCategories = [...new Set(draft.items.map((item) => item.category))]
      const category = itemCategories.length > 1 ? 'Mixed' : itemCategories[0] ?? draft.category ?? 'Other'
      const record: ExpenseRecord = {
        id: editingId ?? draftId ?? crypto.randomUUID(), merchant: draft.merchant.trim(), date: draft.date, amount: Number(draft.total), category,
        items: draft.items.filter((item) => item.name.trim()).map((item) => ({ ...item, name: item.name.trim(), price: Number(item.price) || 0 })),
        tax: draft.tax === null ? null : Number(draft.tax),
        subtotal: draft.subtotal === null ? null : Number(draft.subtotal),
        receiptName: draftFile?.name ?? selected?.receiptName,
        receiptType: draftFile?.type ?? selected?.receiptType,
        icon: iconFor(category), tone: toneFor(category), createdAt: selected?.createdAt ?? Date.now(),
      }
      setDraftId(record.id)
      await onSave(record, draftFile)
      setFlow('idle'); setDraft(null); setDraftFile(undefined); setDraftId(null); setEditingId(null); setSelected(null); setReviewed(false)
      onNotify(editingId ? 'Expense updated.' : wasManual ? 'Expense saved.' : 'Receipt confirmed and saved.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this expense. Your receipt was not saved.')
    } finally { setBusy(false) }
  }

  const removeExpense = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try { await onDelete(deleteTarget.id); setDeleteTarget(null); setSelected(null); setFlow('idle'); onNotify('Expense deleted.') }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not delete this expense.') }
    finally { setBusy(false) }
  }

  const resetFlow = () => { setFlow('idle'); setDraft(null); setDraftFile(undefined); setDraftId(null); setReviewed(false); setError(''); setEditingId(null); setSelected(null) }
  useEffect(() => {
    if (!['review', 'manual', 'edit', 'detail'].includes(flow)) return
    const focusable = () => [...((deleteTarget ? deleteDialogRef.current : dialogRef.current)?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])]
    const focusTimer = window.setTimeout(() => focusable()[0]?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) { if (deleteTarget) setDeleteTarget(null); else resetFlow(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (!elements.length) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => { window.clearTimeout(focusTimer); window.removeEventListener('keydown', handleKeyDown) }
  }, [flow, busy, deleteTarget])

  return <section className="expense-manager">
    <div className="expense-page-heading"><div><div className="eyebrow">YOUR MONEY, CLEARLY</div></div><div className="expense-heading-actions"><button className="secondary-button" onClick={startManualExpense}><Plus size={15}/> Add manually</button><button className="primary-button" onClick={() => fileInput.current?.click()}><Upload size={16}/> Scan a receipt</button></div><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/bmp,application/pdf,.pdf" hidden onChange={(event) => { void startScan(event.target.files?.[0]); event.target.value = '' }}/></div>
    <div className="expense-summary-strip"><div><span>Tracked expenses</span><b>{expenses.length}</b></div><div><span>Total recorded</span><b>{expenses.length ? money(expenses.reduce((sum, expense) => sum + expense.amount, 0)) : '—'}</b></div><div className="summary-note"><ReceiptText size={17}/><span>Receipt files stay on this device.</span></div></div>
    {error && <div className="expense-error" role="alert"><AlertCircle size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
    {flow === 'processing' && <div className="processing-card" role="status"><LoaderCircle className="spin" size={24}/><div><b>Reading your receipt</b><p>{progress}</p><small>Your file is processed locally in this browser.</small></div></div>}
    {flow === 'idle' && <>
      <button className="upload-dropzone" onClick={() => fileInput.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void startScan(event.dataTransfer.files[0]) }}><span className="upload-icon"><Upload size={20}/></span><b>Drop a receipt here, or <span>browse files</span></b><small>JPG, PNG, WEBP, BMP or PDF · up to 15 MB · PDF pages are rendered before OCR</small></button>
      <div className="expense-filters"><label className="expense-search"><Search size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or item" aria-label="Search merchant or item"/>{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14}/></button>}</label><label className="filter-select"><select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)} aria-label="Filter by category"><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={14}/></label><label className="date-filter"><span>From</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} aria-label="Start date"/></label><label className="date-filter"><span>To</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} aria-label="End date"/></label>{(fromDate || toDate || filterCategory !== 'All categories') && <button className="clear-filters" onClick={() => { setFilterCategory('All categories'); setFromDate(''); setToDate('') }}>Clear</button>}</div>
      <div className="expense-list-card"><div className="expense-list-heading"><div><h3>All expenses <span>{filtered.length}</span></h3><p>Search by merchant or an item on the receipt.</p></div><span className="expense-sort-label">MOST RECENT</span></div>
        {filtered.length ? <div className="expense-table"><div className="expense-table-head"><span>MERCHANT / ITEMS</span><span>CATEGORY</span><span>DATE</span><span>TOTAL</span><span/></div>{filtered.map((expense) => <div className="expense-table-row" key={expense.id}><button className="expense-merchant" onClick={() => { setSelected(expense); setFlow('detail') }}><span className={`merchant-icon ${expense.tone}`}>{expense.icon}</span><span><b>{expense.merchant}</b><small>{expense.items.length ? expense.items.map((item) => item.name).slice(0, 2).join(', ') : 'No items added'}{expense.items.length > 2 ? ` +${expense.items.length - 2} more` : ''}</small></span></button><span><i className={`category-tag ${expense.tone}`}>{expense.category}</i></span><span className="expense-date-cell">{dateLabel(expense.date, dateFormat)}</span><b className="expense-amount-cell">{money(expense.amount)}</b><button className="row-action" aria-label={`View ${expense.merchant}`} onClick={() => { setSelected(expense); setFlow('detail') }}><Eye size={16}/></button></div>)}</div> : <div className="expenses-empty">{expenses.length ? <Search size={22}/> : <ReceiptText size={22}/>}<b>{expenses.length ? 'No expenses found' : 'No expenses yet'}</b><p>{expenses.length ? 'Try a different search or remove some filters.' : 'Add an expense manually or scan a receipt to start your history.'}</p>{expenses.length === 0 && <button className="secondary-button" onClick={startManualExpense}><Plus size={15}/> Add your first expense</button>}</div>}
        <div className="expense-mobile-list">{filtered.map((expense) => <button className="expense-mobile-row" key={expense.id} onClick={() => { setSelected(expense); setFlow('detail') }}><span className={`merchant-icon ${expense.tone}`}>{expense.icon}</span><span className="expense-mobile-info"><b>{expense.merchant}</b><small>{dateLabel(expense.date, dateFormat)} · {expense.category}</small><small>{expense.items.map((item) => item.name).slice(0, 2).join(', ')}</small></span><strong>{money(expense.amount)}</strong></button>)}</div>
      </div>
    </>}
    {(flow === 'review' || flow === 'manual' || flow === 'edit') && draft && <div className="expense-modal-backdrop"><section ref={dialogRef} className="receipt-review-card" role="dialog" aria-modal="true" aria-labelledby="review-title"><div className="review-header"><button className="review-back" onClick={resetFlow}><ArrowLeft size={17}/> Expenses</button><span className="review-step">{flow === 'edit' ? 'EDIT EXPENSE' : flow === 'manual' ? 'MANUAL ENTRY' : 'OCR REVIEW'}</span><button className="icon-button" onClick={resetFlow} aria-label="Close form"><X size={18}/></button></div><div className="review-title-block"><div className="review-file-icon">{flow === 'manual' ? <Plus size={20}/> : draftFile?.type === 'application/pdf' || draftFile?.name.toLowerCase().endsWith('.pdf') ? <FileText size={20}/> : <FileImage size={20}/>}</div><div><h2 id="review-title">{flow === 'edit' ? 'Edit expense' : flow === 'manual' ? 'Add expense details' : 'Review extracted details'}</h2><p>{draftFile?.name ?? selected?.receiptName ?? (flow === 'manual' ? 'Enter the details from your receipt.' : 'Receipt details')}</p></div></div>
      {flow === 'review' && <div className="review-all-note">Please review every value from OCR, including fields without a warning badge. Item categories are suggestions and can be changed before saving.</div>}
      {flow === 'review' && <div className="review-caution"><AlertCircle size={18}/><div><b>OCR can make mistakes. Please check every highlighted field.</b><p>Nothing is saved until you review the details and confirm below. Fields marked “Check” were missing or uncertain.</p></div></div>}
      {flow === 'review' && draft.warnings.length > 0 && <div className="ocr-warning-list">{draft.warnings.map((warning) => <p key={warning}><AlertCircle size={14}/>{warning}</p>)}</div>}
      <div className="review-fields"><label className={!draft.merchant ? 'field-needs-review' : ''}><span>Merchant {!draft.merchant && <i>CHECK</i>}</span><input value={draft.merchant} onChange={(event) => updateDraft('merchant', event.target.value)} placeholder="Enter merchant name"/></label><div className="review-field-row"><label className={!draft.date ? 'field-needs-review' : ''}><span>Date {!draft.date && <i>CHECK</i>}</span><input type="date" value={draft.date} onChange={(event) => updateDraft('date', event.target.value)}/></label><label><span>Set all item categories</span><select value={draft.category} onChange={(event) => { const next = event.target.value; setReviewed(false); setDraft((current) => current ? { ...current, category: next, items: next === 'Mixed' ? current.items : current.items.map((item) => ({ ...item, category: next })) } : current) }}>{categories.map((category) => <option key={category} value={category}>{category === 'Mixed' ? 'Mixed · keep item categories' : category}</option>)}</select></label></div><div className="review-field-row amount-fields"><label className={flow === 'review' && draft.subtotal === null ? 'field-needs-review' : ''}><span>Subtotal (₹) {flow === 'review' && draft.subtotal === null && <i>CHECK</i>}</span><input type="number" min="0" step="0.01" value={draft.subtotal ?? ''} onChange={(event) => updateDraft('subtotal', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not detected"/></label><label className={draft.tax === null ? 'field-needs-review' : ''}><span>Tax (₹) {draft.tax === null && <i>CHECK</i>}</span><input type="number" min="0" step="0.01" value={draft.tax ?? ''} onChange={(event) => updateDraft('tax', event.target.value === '' ? null : Number(event.target.value))} placeholder="Not detected"/></label><label className={draft.total === null ? 'field-needs-review' : ''}><span>Total (₹) {draft.total === null && <i>CHECK</i>}</span><input type="number" min="0" step="0.01" value={draft.total ?? ''} onChange={(event) => updateDraft('total', event.target.value === '' ? null : Number(event.target.value))} placeholder="Required"/></label></div></div>
      <div className="review-items-heading"><div><h3>Items <span>{draft.items.length}</span></h3><p>{flow === 'manual' ? 'Optional—add line items to track category splits.' : 'Suggested from item and merchant names—check or change each category.'}</p></div><button className="secondary-button" onClick={addItem}><Plus size={14}/> Add item</button></div>{draft.items.length > 0 ? <div className="review-items">{draft.items.map((item) => <div className="review-item" key={item.id}><input className="item-name-input" value={item.name} onChange={(event) => updateItem(item.id, 'name', event.target.value)} aria-label="Item name" placeholder="Item name"/><input className="item-quantity-input" type="number" min="0" step="any" value={item.quantity ?? ''} onChange={(event) => updateItem(item.id, 'quantity', event.target.value === '' ? undefined : Number(event.target.value))} aria-label="Item quantity" placeholder="Qty"/><input className="item-price-input" type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, 'price', Number(event.target.value))} aria-label="Item amount" placeholder="Amount"/><select className="item-category-select" value={item.category} onChange={(event) => updateItem(item.id, 'category', event.target.value)} aria-label="Item category">{categories.map((category) => <option key={category}>{category}</option>)}</select><button className="remove-item-button" onClick={() => removeItem(item.id)} aria-label="Remove item"><Trash2 size={14}/></button></div>)}</div> : <div className="no-items-warning"><AlertCircle size={15}/>{flow === 'manual' ? 'No line items added. You can save a total-only expense or add items.' : 'No items were recognized. Add items if you want item-level search and categories.'}</div>}
      {categorySplit.length > 0 && <div className="category-split-preview"><b>Category split</b><div>{categorySplit.map(([category, amount]) => <span key={category}><i className={`category-tag ${toneFor(category)}`}>{category}</i><strong>{money(amount)}</strong></span>)}</div></div>}
      {consistencyWarning && <div className="totals-mismatch"><AlertCircle size={15}/><span>{consistencyWarning}</span></div>}
      <label className="review-confirm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/><span><b>{flow === 'manual' ? 'I confirm these expense details are correct.' : 'I reviewed and confirmed these details.'}</b><small>{flow === 'review' ? 'OCR results are suggestions; you are responsible for the saved values.' : 'Your entry is saved only after you confirm.'}</small></span></label><div className="review-actions"><button className="secondary-button" onClick={resetFlow}>Cancel</button><button className="primary-button" disabled={busy || !reviewed || !draft.merchant.trim() || !draft.date || !draft.total || Number(draft.total) <= 0} onClick={() => void saveDraft()}>{busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>} {busy ? 'Saving…' : flow === 'edit' ? 'Save changes' : flow === 'manual' ? 'Save expense' : 'Confirm and save'}</button></div><p className="privacy-note">{cloudMode ? `After confirmation, expense details are saved to Supabase${draftFile ? '; the receipt file stays on this device.' : '.'}` : 'After confirmation, expense details and any receipt file are saved in this browser.'}</p></section></div>}
    {flow === 'detail' && selected && <div className="expense-modal-backdrop" onClick={resetFlow}><section ref={dialogRef} className="expense-detail-card" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}><div className="detail-header"><button className="review-back" onClick={resetFlow}><ArrowLeft size={17}/> Expenses</button><button className="icon-button" onClick={resetFlow} aria-label="Close details"><X size={18}/></button></div><div className="detail-merchant"><span className={`merchant-icon detail-icon ${selected.tone}`}>{selected.icon}</span><div><h2 id="detail-title">{selected.merchant}</h2><p>{dateLabel(selected.date, dateFormat)} · <i className={`category-tag ${selected.tone}`}>{selected.category}</i></p></div><b>{money(selected.amount)}</b></div>{detailCategorySplit.length > 1 && <div className="detail-category-split"><b>Category split</b>{detailCategorySplit.map(([category, amount]) => <span key={category}><i className={`category-tag ${toneFor(category)}`}>{category}</i><strong>{money(amount)}</strong></span>)}</div>}<div className="detail-section"><h3>Items</h3>{selected.items.length ? selected.items.map((item) => <div className="detail-item" key={item.id}><span>{item.name}<small>{item.category}</small></span><b>{money(item.price)}</b></div>) : <p className="detail-muted">No line items recorded.</p>}{selected.tax !== null && <div className="detail-item"><span>Tax</span><b>{money(selected.tax)}</b></div>}<div className="detail-total"><span>Total</span><b>{money(selected.amount)}</b></div></div><div className="detail-file"><span className="review-file-icon"><ReceiptText size={18}/></span><span><b>{selected.receiptName ?? 'No receipt attached'}</b><small>{selected.receiptName ? 'Saved on this device' : 'No file attached'}</small></span>{selected.receiptName && <button className="icon-button" onClick={() => void onOpenFile(selected.id)} aria-label="Open saved receipt"><ArrowDownToLine size={17}/></button>}</div><div className="detail-actions"><button className="secondary-button danger-button" onClick={() => setDeleteTarget(selected)}><Trash2 size={15}/> Delete</button><button className="primary-button" onClick={() => openEdit(selected)}><Pencil size={15}/> Edit expense</button></div></section></div>}
    {deleteTarget && <div className="expense-modal-backdrop" onClick={() => setDeleteTarget(null)}><section ref={deleteDialogRef} className="delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="delete-expense-title" onClick={(event) => event.stopPropagation()}><span className="delete-warning-icon"><Trash2 size={19}/></span><h2 id="delete-expense-title">Delete this expense?</h2><p><b>{deleteTarget.merchant}</b> and its expense details{deleteTarget.receiptName ? ' and attached receipt file' : ''} will be removed. This cannot be undone.</p><div className="review-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Keep expense</button><button className="delete-button" disabled={busy} onClick={() => void removeExpense()}>{busy ? 'Deleting…' : 'Delete expense'}</button></div></section></div>}
  </section>
}
