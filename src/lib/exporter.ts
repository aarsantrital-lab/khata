import { getFontEmbedCSS, toCanvas } from 'html-to-image'

let fontCss: Promise<string> | null = null

async function capture(node: HTMLElement): Promise<HTMLCanvasElement> {
  fontCss ??= getFontEmbedCSS(node).catch(() => '')
  return toCanvas(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    fontEmbedCSS: await fontCss,
    style: { transform: 'none', margin: '0' },
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('render_failed'))), type, 0.95))
}

/** Renders a document element to a PNG (for the gallery or WhatsApp). */
export async function nodeToPng(node: HTMLElement): Promise<Blob> {
  return canvasToBlob(await capture(node))
}

export type PaperSize = 'a4' | 'a5'

/**
 * Builds a PDF from the document. If it contains [data-pdf-page] children each one becomes
 * a page; otherwise the rendered image is sliced across as many pages as needed.
 * Rendering through an image keeps Devanagari text correct without embedding fonts in the PDF.
 */
export async function nodeToPdf(node: HTMLElement, size: PaperSize = 'a4'): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: size, orientation: 'portrait', compress: true })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = size === 'a4' ? 8 : 6
  const usableW = pageW - margin * 2
  const usableH = pageH - margin * 2

  const pages = Array.from(node.querySelectorAll<HTMLElement>('[data-pdf-page]'))
  if (pages.length) {
    for (let i = 0; i < pages.length; i++) {
      const canvas = await capture(pages[i])
      const ratio = Math.min(usableW / canvas.width, usableH / canvas.height)
      if (i > 0) pdf.addPage(size, 'portrait')
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, canvas.width * ratio, canvas.height * ratio)
    }
    return pdf.output('blob')
  }

  const canvas = await capture(node)
  const mmPerPx = usableW / canvas.width
  const sliceH = Math.floor(usableH / mmPerPx)
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, slice.width, h)
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h)
    if (page > 0) pdf.addPage(size, 'portrait')
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, usableW, h * mmPerPx)
  }
  return pdf.output('blob')
}

/** Uses the browser's print dialog, which also offers "Save as PDF". */
export function printDocument(size: PaperSize) {
  let style = document.getElementById('print-page-size') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'print-page-size'
    document.head.appendChild(style)
  }
  style.textContent = `@page { size: ${size.toUpperCase()} portrait; margin: ${size === 'a4' ? 10 : 7}mm; }`
  window.print()
}

export interface SheetColumn<T> {
  header: string
  width: number
  value: (row: T) => string | number
  money?: boolean
}

export async function rowsToXlsx<T>(title: string, rows: T[], columns: SheetColumn<T>[], totals?: (string | number)[]): Promise<Blob> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  type Cell = { value: string | number; fontWeight?: 'bold'; format?: string; type?: typeof Number | typeof String } | null
  const header: Cell[] = columns.map((c) => ({ value: c.header, fontWeight: 'bold' }))
  const body: Cell[][] = rows.map((r) =>
    columns.map((c) => {
      const v = c.value(r)
      return typeof v === 'number' ? { value: v, type: Number, format: c.money ? '#,##0.00' : '0' } : { value: v, type: String }
    }),
  )
  const sheet: Cell[][] = [[{ value: title, fontWeight: 'bold' }, ...columns.slice(1).map(() => null)], header, ...body]
  if (totals)
    sheet.push(totals.map((v, i) => (typeof v === 'number' ? { value: v, type: Number, format: columns[i]?.money ? '#,##0.00' : '0', fontWeight: 'bold' } : { value: v, fontWeight: 'bold' })))
  const result = writeXlsxFile(sheet as never, { columns: columns.map((c) => ({ width: c.width })) } as never)
  return (result as unknown as { toBlob: () => Promise<Blob> }).toBlob()
}
