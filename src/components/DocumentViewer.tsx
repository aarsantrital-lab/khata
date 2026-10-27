import { FileDown, ImageDown, Loader2, MessageCircle, Printer, Smartphone } from 'lucide-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/app/locale'
import { nodeToPdf, nodeToPng, printDocument, type PaperSize } from '@/lib/exporter'
import { downloadBlob, saveFile, shareFile, viberLink, whatsappLink } from '@/lib/share'

export const DOC_WIDTH = 720

/** Shows a printable document scaled to the screen, with save / print / share actions. */
export function DocumentViewer({
  filename,
  shareText,
  phone,
  children,
}: {
  filename: string
  shareText: string
  phone?: string
  children: ReactNode
}) {
  const { t } = useLocale()
  const wrapRef = useRef<HTMLDivElement>(null)
  const docRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [height, setHeight] = useState<number | undefined>()
  const [busy, setBusy] = useState<string | null>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const doc = docRef.current
    if (!wrap || !doc) return
    const update = () => {
      const s = Math.min(1, wrap.clientWidth / DOC_WIDTH)
      setScale(s)
      setHeight(doc.offsetHeight * s)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(wrap)
    ro.observe(doc)
    return () => ro.disconnect()
  }, [])

  const run = async (key: string, fn: () => Promise<void>) => {
    if (!docRef.current) return
    setBusy(key)
    try {
      await document.fonts?.ready
      await fn()
    } catch (err) {
      console.error(err)
      toast.error(t('err_generic'))
    } finally {
      setBusy(null)
    }
  }

  const saveImage = () =>
    run('image', async () => {
      await saveFile(await nodeToPng(docRef.current!), `${filename}.png`)
      toast.success(t('saved_file'))
    })

  const savePdf = (size: PaperSize) =>
    run('pdf', async () => {
      await saveFile(await nodeToPdf(docRef.current!, size), `${filename}.pdf`)
      toast.success(t('saved_file'))
    })

  const share = (target?: 'whatsapp' | 'viber') =>
    run('share', async () => {
      const png = await nodeToPng(docRef.current!)
      if (await shareFile(png, `${filename}.png`, shareText)) return
      downloadBlob(png, `${filename}.png`)
      if (target === 'viber') window.location.href = viberLink(shareText)
      else window.open(whatsappLink(phone ?? '', shareText), '_blank', 'noopener')
    })

  const icon = (key: string, el: ReactNode) => (busy === key ? <Loader2 className="animate-spin" /> : el)

  return (
    <div className="mx-auto flex w-full flex-col gap-4" style={{ maxWidth: DOC_WIDTH + 2 }}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Button size="touch" onClick={() => share('whatsapp')} disabled={!!busy} className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" data-testid="doc-share">
          {icon('share', <MessageCircle />)}
          {t('whatsapp')}
        </Button>
        <Button size="touch" onClick={() => share('viber')} disabled={!!busy} className="bg-[#7360f2] text-white hover:bg-[#6150d8]">
          {icon('share', <Smartphone />)}
          {t('viber')}
        </Button>
        <Button size="touch" variant="outline" onClick={saveImage} disabled={!!busy} data-testid="doc-image">
          {icon('image', <ImageDown />)}
          {t('save_image')}
        </Button>
        <Button size="touch" variant="outline" onClick={() => savePdf('a4')} disabled={!!busy} data-testid="doc-pdf">
          {icon('pdf', <FileDown />)}
          {t('save_pdf')}
        </Button>
        <Button size="touch" variant="outline" onClick={() => printDocument('a4')} disabled={!!busy} data-testid="doc-print-a4">
          <Printer />
          {t('print_a4')}
        </Button>
        <Button size="touch" variant="outline" onClick={() => printDocument('a5')} disabled={!!busy}>
          <Printer />
          {t('print_a5')}
        </Button>
      </div>
      <div ref={wrapRef} className="w-full overflow-hidden rounded-xl border bg-muted/50 p-0" style={{ height }}>
        <div style={{ width: DOC_WIDTH, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div ref={docRef} className="print-area bg-white text-[#111]" style={{ width: DOC_WIDTH }} data-testid="document">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
