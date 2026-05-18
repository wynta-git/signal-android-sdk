'use client';
import Icon from './Icon';

interface PagerProps {
  page: number;
  pageTotal: number;
  onChange: (p: number) => void;
}

export default function Pager({ page, pageTotal, onChange }: PagerProps) {
  if (pageTotal <= 1) return null;

  const pages: (number | '…')[] = [];
  for (let i = 1; i <= pageTotal; i++) {
    if (i === 1 || i === pageTotal || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  return (
    <div className="pager-controls">
      <button
        className="pager-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <Icon name="chevron-left" size={12}/>
      </button>
      {pages.map((p, i) => p === '…' ? (
        <span key={i} className="pager-ellipsis">…</span>
      ) : (
        <button
          key={p}
          className={'pager-btn' + (p === page ? ' active' : '')}
          onClick={() => onChange(p as number)}
          aria-label={`Page ${p}`}
          aria-current={p === page ? 'page' : undefined}
        >
          {p}
        </button>
      ))}
      <button
        className="pager-btn"
        disabled={page >= pageTotal}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <Icon name="chevron-right" size={12}/>
      </button>
    </div>
  );
}
