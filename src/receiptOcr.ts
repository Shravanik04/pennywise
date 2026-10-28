import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export type ReceiptItem = { id: string; name: string; quantity?: number; price: number; category: string }
export type ReceiptDraft = {
  merchant: string
  date: string
  category: string
  subtotal: number | null
  tax: number | null
  total: number | null
  items: ReceiptItem[]
  warnings: string[]
  rawText: string
}
type TesseractWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>

export const categories = ['Food & drink', 'Groceries', 'Personal Care', 'Transport', 'Shopping', 'Bills', 'Health', 'Subscriptions', 'Other', 'Mixed']
const categoryFor = (itemName: string, merchant: string) => {
  const item = itemName.toLowerCase()
  const shop = merchant.toLowerCase()
  if (/shampoo|soap|toothpaste|toothbrush|skincare|skin care|lotion|deodorant|hair oil|face ?wash|sanitary|razor|conditioner|body wash|cosmetic|moisturi[sz]er|detergent|dishwash|cleaner/.test(item)) return 'Personal Care'
  if (/milk|biscuit|cookie|rice|atta|flour|bread|fruit|vegetable|dal|pulses|egg|oil|grocery|cheese|yogurt|curd|snack|beverage|water/.test(item)) return 'Groceries'
  if (/medicine|pharmacy|vitamin|tablet|health|clinic/.test(item)) return 'Health'
  if (/uber|ola|rapido|metro|bus|taxi|fuel|petrol|parking/.test(`${item} ${shop}`)) return 'Transport'
  if (/netflix|spotify|prime video|subscription/.test(`${item} ${shop}`)) return 'Subscriptions'
  if (/restaurant|cafe|coffee|dining|food|pizza|burger|meal|lunch|dinner/.test(`${item} ${shop}`)) return 'Food & drink'
  if (/dmart|d-mart|bigbasket|blinkit|zepto|instamart|reliance fresh|more supermarket|supermarket|grocery/.test(shop)) return 'Groceries'
  if (/mall|apparel|fashion|electronics|retail|amazon|flipkart/.test(shop)) return 'Shopping'
  if (/electricity|water bill|internet|broadband|utility|gas bill/.test(item)) return 'Bills'
  return 'Other'
}
const parseAmount = (value: string) => {
  const normalized = value.replace(/[₹$€£,\s]/g, '').replace(/\((.+)\)/, '-$1')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? Math.abs(parsed) : null
}
const normalizeItemName = (value: string) => {
  if (!/[A-Z]/.test(value) || /[a-z]/.test(value)) return value
  return value.toLowerCase().replace(/\b([a-z])/g, (_, letter: string) => letter.toUpperCase()).replace(/(\d+)l\b/i, '$1L')
}
const itemId = () => crypto.randomUUID()

function extractFields(text: string): ReceiptDraft {
  const lines = text.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4})\b/i)
  let date = ''
  if (dateMatch) {
    const raw = dateMatch[0]
    const parts = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
    const iso = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
    if (iso) date = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    else if (parts) {
      const year = Number(parts[3]) < 100 ? `20${parts[3]}` : parts[3]
      date = `${year}-${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    } else {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) date = parsed.toISOString().slice(0, 10)
    }
    if (date) {
      const parsed = new Date(`${date}T00:00:00Z`)
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) date = ''
    }
  }

  const trailingAmount = (line: string) => {
    const match = line.match(/(?:₹\s*)?((?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)\s*$/)
    return match ? { value: parseAmount(match[1]), prefix: line.slice(0, match.index).trim() } : null
  }
  const labeledAmount = (label: RegExp) => {
    const line = lines.find((candidate) => label.test(candidate))
    return line ? trailingAmount(line)?.value ?? null : null
  }
  const subtotal = labeledAmount(/\bsubtotal\s+before\s+tax\b/i)
  const tax = labeledAmount(/\btotal\s+gst\b/i)
  const total = labeledAmount(/\bgrand\s+total\b/i)

  const tableHeading = lines.findIndex((line) => /\bitem\b/i.test(line) && /\bqty\b/i.test(line) && /\bamount\b/i.test(line))
  const totalsHeading = /\b(?:item\s+total|sub\s*total|subtotal|cgst|sgst|igst|total\s+gst|gst|tax|grand\s+total|amount\s+paid|payment)\b/i
  const tableRows = tableHeading < 0 ? [] : lines.slice(tableHeading + 1)
  const totalsStart = tableRows.findIndex((line) => totalsHeading.test(line))
  const itemLines = totalsStart < 0 ? tableRows : tableRows.slice(0, totalsStart)
  const parsedItems = itemLines.flatMap((line) => {
    const amount = trailingAmount(line)
    if (!amount?.value || amount.value <= 0 || !amount.prefix || amount.prefix.length > 70) return []
    const quantityMatch = amount.prefix.match(/^(.*?)\s+(\d+(?:\.\d{1,3})?)\s*$/)
    const name = (quantityMatch?.[1] ?? amount.prefix).replace(/^[*\-•\d.)\s]+/, '').trim()
    const quantity = quantityMatch ? Number(quantityMatch[2]) : undefined
    if (name.length < 2 || /\b(?:item|qty|amount)\b/i.test(name)) return []
    return [{ id: itemId(), name: normalizeItemName(name), ...(quantity !== undefined && Number.isFinite(quantity) && quantity > 0 ? { quantity } : {}), price: amount.value }]
  }).slice(0, 30)
  const merchantEnd = tableHeading < 0 ? lines.length : tableHeading
  const merchant = lines.slice(0, merchantEnd).map((line) => line
    .replace(dateMatch?.[0] ?? '\u0000', '')
    .replace(/^(?:merchant|store)\s*:\s*/i, '')
    .trim())
    .find((line) => line.length > 2 && line.length < 75 && /[a-z]/i.test(line)
      && !/\d{5,}|@|https?:|\b(invoice|receipt|tax|gstin|date|time|phone|tel|payment|pune|maharashtra|address|cashier)\b/i.test(line)
      && !/^\d{1,4}[/-]\d{1,2}[/-]\d{2,4}$/.test(line)) ?? ''
  const items = parsedItems.map((item) => ({ ...item, category: categoryFor(item.name, merchant) }))
  const warnings: string[] = []
  if (!merchant) warnings.push('Merchant could not be identified—enter it manually.')
  if (!date) warnings.push('Date could not be identified—enter it manually.')
  if (total === null) warnings.push('Total could not be identified—enter it manually.')
  if (subtotal === null) warnings.push('Subtotal before tax was not detected. Check the receipt and enter it if shown.')
  if (items.length === 0) warnings.push('No line items were confidently recognized. Add or correct items below.')
  if (tax === null) warnings.push('Tax was not detected. Check the receipt and enter tax if shown.')
  const unrecognizedRows = itemLines.filter((line) => /[a-z]/i.test(line) && !trailingAmount(line))
  if (unrecognizedRows.length > 0) warnings.push(`Some item rows could not be fully read (${items.length} detected). Check the item count, quantities, and amounts.`)
  if (items.some((item) => item.quantity === undefined)) warnings.push('One or more item quantities could not be read. Check each quantity before saving.')
  const itemCategories = [...new Set(items.map((item) => item.category))]
  const category = itemCategories.length === 1 ? itemCategories[0] : itemCategories.length > 1 ? 'Mixed' : categoryFor('', merchant)
  return { merchant, date, category, subtotal, tax, total, items, warnings, rawText: text }
}

async function extractPdfText(file: File): Promise<string> {
  const document = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  if (document.numPages > 20) throw new Error('This PDF has more than 20 pages. Split it into smaller receipt files and try again.')
  const lines: string[] = []
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber)
    const content = await page.getTextContent()
    const rows: Array<{ y: number; parts: Array<{ x: number; text: string }> }> = []
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const x = item.transform[4]
      const y = item.transform[5]
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2)
      if (!row) {
        row = { y, parts: [] }
        rows.push(row)
      }
      row.parts.push({ x, text: item.str.trim() })
    }
    lines.push(...rows.sort((a, b) => b.y - a.y).map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(' ')))
  }
  return lines.join('\n')
}

async function fileToImages(file: File, onProgress: (message: string) => void): Promise<Array<{ image: string | HTMLCanvasElement; label: string }>> {
  if (file.type.startsWith('image/')) {
    return [{ image: URL.createObjectURL(file), label: file.name }]
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Unsupported file. Upload a JPG, PNG, WEBP, or PDF receipt.')
  }
  onProgress('Rendering PDF pages…')
  const pdfDocument = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  if (pdfDocument.numPages > 20) throw new Error('This PDF has more than 20 pages. Split it into smaller receipt files and try again.')
  const pages = pdfDocument.numPages
  const images: Array<{ image: HTMLCanvasElement; label: string }> = []
  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    const page = await pdfDocument.getPage(pageNumber)
    const viewport = page.getViewport({ scale: Math.min(2, 1600 / page.getViewport({ scale: 1 }).width) })
    const canvas = window.document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise
    images.push({ image: canvas, label: `${file.name} · page ${pageNumber}` })
  }
  return images
}

export async function scanReceipt(file: File, onProgress: (message: string) => void): Promise<ReceiptDraft> {
  if (file.size > 15 * 1024 * 1024) throw new Error('This file is larger than 15 MB. Choose a smaller receipt file.')
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    onProgress('Reading selectable PDF text…')
    let pdfText = ''
    try {
      pdfText = await extractPdfText(file)
    } catch {
      onProgress('Selectable PDF text could not be read; switching to image OCR…')
    }
    if (pdfText.trim().length > 20) return extractFields(pdfText)
  }
  const images = await fileToImages(file, onProgress)
  if (images.length === 0) throw new Error('This PDF does not contain any readable pages.')
  onProgress(`Reading ${images.length > 1 ? `${images.length} pages` : 'receipt text'} with OCR…`)
  let worker: TesseractWorker | undefined
  try {
    try {
      const { createWorker } = await import('tesseract.js')
      worker = await createWorker('eng')
    } catch {
      throw new Error('The OCR engine could not start. Check your internet connection for the one-time English language-data download, then try again.')
    }
    let combinedText = ''
    for (let index = 0; index < images.length; index += 1) {
      onProgress(`Reading ${images[index].label} (${index + 1} of ${images.length})…`)
      let result
      try {
        result = await worker.recognize(images[index].image)
      } catch {
        throw new Error('OCR could not read this receipt. Try a clearer, well-lit image or another file format.')
      }
      combinedText += `\n${result.data.text}`
    }
    if (!combinedText.trim()) {
      return { merchant: '', date: '', category: 'Other', subtotal: null, tax: null, total: null, items: [], warnings: ['No readable text was found. Try a sharper, well-lit image or enter the receipt details manually.'], rawText: '' }
    }
    return extractFields(combinedText)
  } finally {
    await worker?.terminate()
    for (const entry of images) if (typeof entry.image === 'string') URL.revokeObjectURL(entry.image)
  }
}
