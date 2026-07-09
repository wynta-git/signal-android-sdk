'use client';

interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export default function Toggle({ on, onChange, label, disabled }: ToggleProps) {
  return (
    <div
      className={'toggle' + (on ? ' on' : '') + (disabled ? ' disabled' : '')}
      onClick={() => { if (!disabled) onChange(!on); }}
    >
      <span className="track" />
      {label && <span className="label">{label}</span>}
    </div>
  );
}
