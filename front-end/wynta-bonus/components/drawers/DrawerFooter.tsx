'use client';

interface DrawerFooterProps {
  submitting: boolean;
  onCancel: () => void;
  label?: string;
  disabled?: boolean;
}

export default function DrawerFooter({ submitting, onCancel, label, disabled }: DrawerFooterProps) {
  return (
    <div className="drawer-footer">
      <button className="btn btn-primary btn-full" type="submit" disabled={submitting || disabled}>
        {submitting ? <><span className="spinner"/> Saving…</> : <>{label || 'Save'}</>}
      </button>
      <a className="cancel-link" onClick={onCancel}>Cancel</a>
    </div>
  );
}
