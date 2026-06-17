'use client';
import { HISTORY_KIND_META } from '../../services/mocks/history';
import { avatarGradient, initial, formatRelative, formatDate } from '../../services/mocks/utils';
import Icon from 'wynta-react-common/components/Icon';

interface HistoryKindMeta {
  icon: string;
  color: string;
  label: string;
}

interface FieldChange {
  field: string;
  old: string;
  new: string;
}

interface HistoryEvt {
  kind: string;
  actor: string;
  at: string;
  summary: string;
  field?: string;
  old?: unknown;
  new?: unknown;
  newValue?: string;
  reason?: string;
  changes?: FieldChange[];
}

interface HistoryRowProps {
  evt: HistoryEvt;
  last: boolean;
}

export default function HistoryRow({ evt, last }: HistoryRowProps) {
  const meta: HistoryKindMeta = HISTORY_KIND_META[evt.kind] || { icon: 'circle', color: 'var(--g400)', label: evt.kind };

  return (
    <div className={'history-row' + (last ? ' last' : '')}>
      <div className="hr-rail">
        <span className="hr-avatar" style={{ background: avatarGradient(evt.actor) }}>{initial(evt.actor)}</span>
        {!last && <span className="hr-line"/>}
      </div>
      <div className="hr-body">
        <div className="hr-meta">
          <span className="hr-actor">{evt.actor}</span>
          <span className="hr-dot"/>
          <span className="hr-when" title={formatDate(evt.at)}>{formatRelative(evt.at)}</span>
        </div>
        <div className="hr-event">
          <span className="hr-icon" style={{ color: meta.color }}>
            <Icon name={meta.icon} size={12} strokeWidth={2}/>
          </span>
          <span className="hr-summary">{evt.summary}</span>
        </div>
        {evt.changes && evt.changes.length > 0 ? (
          <div className="hr-changes">
            {evt.changes.map((c, i) => (
              <div key={i} className="hr-diff">
                <span className="hr-pill"><strong>{c.field}</strong></span>
                <span className="hr-old">{c.old}</span>
                <Icon name="arrow-right" size={11} color="var(--g400)"/>
                <span className="hr-new">{c.new}</span>
              </div>
            ))}
          </div>
        ) : (evt.field || evt.newValue || evt.reason) && (
          <div className="hr-diff">
            {evt.field && (
              <span className="hr-pill"><strong>{evt.field}</strong></span>
            )}
            {evt.old !== undefined && (
              <>
                <span className="hr-old">{String(evt.old)}</span>
                <Icon name="arrow-right" size={11} color="var(--g400)"/>
                <span className="hr-new">{String(evt.new)}</span>
              </>
            )}
            {evt.newValue && !evt.field && (
              <span className="hr-new">{evt.newValue}</span>
            )}
            {evt.reason && (
              <span className="hr-reason">{evt.reason}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
