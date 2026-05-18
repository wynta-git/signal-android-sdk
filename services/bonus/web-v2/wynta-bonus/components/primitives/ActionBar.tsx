'use client';

interface ActionBarProps {
  children?: React.ReactNode;
}

export default function ActionBar({ children }: ActionBarProps) {
  return (
    <div className="action-bar">
      {children}
    </div>
  );
}
