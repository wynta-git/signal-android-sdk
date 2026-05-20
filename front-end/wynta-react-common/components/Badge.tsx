'use client';

interface BadgeProps {
  active?: boolean;
  kind?: string;
  children?: React.ReactNode;
}

export default function Badge({ active, kind = 'status', children }: BadgeProps) {
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
