import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

const selectStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--g200)', borderRadius: 'var(--r)',
  padding: '8px 11px', fontSize: 12.5, color: 'var(--g900)', background: '#fff',
  outline: 'none', transition: 'border-color 0.12s, box-shadow 0.12s',
  fontFamily: 'inherit', cursor: 'pointer',
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select({ label, error, children, style, ...rest }, ref) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--g600)' }}>{label}</label>
      )}
      <select
        ref={ref}
        style={{
          ...selectStyle,
          borderColor: error ? 'var(--err)' : 'var(--g200)',
          background: rest.disabled ? 'var(--g50)' : '#fff',
          ...style,
        }}
        onFocus={e => {
          e.currentTarget.style.borderColor = error ? 'var(--err)' : 'var(--blue)'
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,145,224,0.1)'
        }}
        onBlur={e => {
          e.currentTarget.style.borderColor = error ? 'var(--err)' : 'var(--g200)'
          e.currentTarget.style.boxShadow = 'none'
        }}
        {...rest}
      >
        {children}
      </select>
      {error && <p style={{ fontSize: 11.5, color: 'var(--err)', margin: 0 }}>{error}</p>}
    </div>
  )
})
