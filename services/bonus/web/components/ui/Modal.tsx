'use client'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  width?: number
}

export function Modal({ open, onClose, title, children, width = 520 }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)' }}
        onClick={onClose}
      />
      <div style={{
        position: 'relative', background: '#fff',
        borderRadius: 'var(--rxl)', boxShadow: '0 4px 20px rgba(0,0,0,0.35)',
        width, maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {title && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 18px', borderBottom: '1px solid var(--g150)',
          }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--g700)' }}>{title}</h3>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--g400)', padding: 4, display: 'flex', borderRadius: 4 }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>{children}</div>
      </div>
    </div>
  )
}
