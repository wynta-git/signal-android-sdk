'use client';

export default function Badge({ active, kind = 'status', children }) {
  if (kind === 'status') {
    return (
      <span className={'badge ' + (active ? 'active' : 'inactive')}>
        <span className="ind" />
        {children || (active ? 'Active' : 'Inactive')}
      </span>
    );
  }
  return <span className={'badge ' + kind}>{children}</span>;
}
