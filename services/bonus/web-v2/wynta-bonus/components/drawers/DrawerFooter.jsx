'use client';

export default function DrawerFooter({ submitting, onCancel, label }) {
  return (
    <div className="drawer-footer">
      <button className="btn btn-primary btn-full" type="submit" disabled={submitting}>
        {submitting ? <><span className="spinner"/> Saving…</> : <>{label || 'Save'}</>}
      </button>
      <a className="cancel-link" onClick={onCancel}>Cancel</a>
    </div>
  );
}
