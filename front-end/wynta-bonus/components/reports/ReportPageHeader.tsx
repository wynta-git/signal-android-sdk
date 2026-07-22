'use client';
import Icon from 'wynta-react-common/components/Icon';
import type { ReportDateRange } from '../../types';

interface Props {
  title: string;
  description: string;
  range?: ReportDateRange;
  onRangeChange?: (range: ReportDateRange) => void;
  onExport: () => void;
  exportDisabled?: boolean;
}

export default function ReportPageHeader({
  title, description, range, onRangeChange, onExport, exportDisabled,
}: Props) {
  return (
    <div className="dq-header">
      <div>
        <h1 className="dq-title">{title}</h1>
        <div className="dq-title-desc">{description}</div>
      </div>
      <div className="dq-report-controls">
        {range && onRangeChange && (
          <>
            <label className="dq-report-date-group">
              From
              <input
                type="date"
                className="dq-report-date-input"
                value={range.startDate}
                max={range.endDate}
                onChange={(e) => onRangeChange({ ...range, startDate: e.target.value })}
              />
            </label>
            <label className="dq-report-date-group">
              to
              <input
                type="date"
                className="dq-report-date-input"
                value={range.endDate}
                min={range.startDate}
                onChange={(e) => onRangeChange({ ...range, endDate: e.target.value })}
              />
            </label>
          </>
        )}
        <button type="button" className="dq-export-btn" onClick={onExport} disabled={exportDisabled}>
          <Icon name="download" size={14} strokeWidth={2} />
          Export CSV
        </button>
      </div>
    </div>
  );
}
