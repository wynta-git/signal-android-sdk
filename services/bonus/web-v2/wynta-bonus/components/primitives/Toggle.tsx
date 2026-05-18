'use client';

interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export default function Toggle({ on, onChange, label }: ToggleProps) {
  return (
    <div className={'toggle' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="track" />
      {label && <span className="label">{label}</span>}
    </div>
  );
}
