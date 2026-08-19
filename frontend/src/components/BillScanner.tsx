import { Camera, Spinner } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { api, ApiError } from '../lib/apiClient'
import { compressBillImage } from '../lib/imageCompress'
import type { BillExtraction } from '../lib/types'
import { Button } from './ui/Button'
import AlertBanner from './AlertBanner'

interface Props {
  billType: 'purchase' | 'sale'
  /** Called with the extracted bill once the owner's photo has been read.
   *  The parent decides how to merge it into the form — this component never
   *  commits anything itself. */
  onExtracted: (result: BillExtraction) => void
}

/** "Scan a bill" entry point.
 *
 *  Deliberately an *optional shortcut* sitting above the manual form rather
 *  than a replacement for it: extraction can fail, be unconfigured, or be
 *  merely approximate, and in every one of those cases the owner must still
 *  be able to type the bill in. So a failure here only ever shows a message —
 *  it never blocks or clears the form underneath.
 */
export default function BillScanner({ billType, onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset immediately so picking the same file twice still fires a change
    // event — otherwise a retry after a failure silently does nothing.
    e.target.value = ''
    if (!file) return

    setError(null)
    setBusy(true)
    try {
      // Downscale before upload: a raw phone photo will exceed the server's
      // request-body limit and fail with an unhelpful platform error.
      const prepared = await compressBillImage(file)
      const form = new FormData()
      form.append('file', prepared)
      form.append('bill_type', billType)

      const result = await api.upload<BillExtraction>('/bills/extract', form)
      onExtracted(result)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('That took too long to read. Try again, or enter the bill manually.')
      } else if (err instanceof ApiError && err.status === 503) {
        // Feature not configured on this deployment, or the model is down.
        setError(err.message)
      } else {
        setError(err instanceof ApiError ? err.message : 'Could not read that bill. Please enter it manually.')
      }
    } finally {
      setBusy(false)
    }
  }

  const label = billType === 'purchase' ? 'Scan supplier bill' : 'Scan sales invoice'

  return (
    <div className="space-y-2.5">
      <input
        ref={inputRef}
        type="file"
        // `capture` asks a phone to open the camera directly rather than the
        // gallery, which is what the owner wants standing at the counter with
        // a paper bill in hand. Desktop browsers ignore it and show a picker.
        accept="image/*,application/pdf"
        capture="environment"
        onChange={handleFile}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />
      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={busy}
        icon={
          busy ? (
            <Spinner size={18} className="animate-spin" aria-hidden="true" />
          ) : (
            <Camera size={18} weight="duotone" aria-hidden="true" />
          )
        }
        onClick={() => inputRef.current?.click()}
      >
        {busy ? 'Reading bill…' : label}
      </Button>

      {busy && (
        <p className="text-center text-xs text-ink-muted">
          Reading the photo — this usually takes a few seconds.
        </p>
      )}

      {error && <AlertBanner tone="bad">{error}</AlertBanner>}
    </div>
  )
}
