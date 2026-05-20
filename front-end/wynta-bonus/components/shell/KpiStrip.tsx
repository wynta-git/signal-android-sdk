'use client';
import { useAppSelector } from '../../store/hooks';
import { formatINRCompact } from '../../services/mocks/utils';
import CountUp from 'wynta-react-common/components/CountUp';
import CountUpCurrency from '../../components/primitives/CountUpCurrency';
import Icon from 'wynta-react-common/components/Icon';

export default function KpiStrip() {
  const kpi = useAppSelector(s => s.kpi);

  const released     = Number(kpi.monthly_released);
  const monthlyLimit = Number(kpi.monthly_limit);
  const pctOfLimit   = kpi.monthly_pct;
  const consumed     = released * 0.58;
  const pending      = released * 0.27;
  const forfeit      = released * 0.15;

  return (
    <div className="kpi-strip">
      <div className="kpi-cell" style={{ animationDelay: '0ms' }}>
        <div className="kpi-eyebrow">
          <span className="kpi-eyebrow-icon"><Icon name="ticket" size={11} strokeWidth={2}/></span>
          Total Active Promo Codes
        </div>
        <div className="kpi-block">
          <div className="kpi-codes-row">
            <div className="kpi-codes-number">
              <CountUp value={kpi.active_codes} format={(n) => Math.round(n).toLocaleString('en-IN')}/>
            </div>
            <span className="kpi-codes-delta">
              <Icon name="trending-up" size={11} strokeWidth={2.5}/>
              +12 this week
            </span>
          </div>
          <div className="kpi-codes-pills">
            <span className="kpi-pill" title="Active Bonus Heads">
              <span className="kpi-pill-icon"><Icon name="folders" size={11} strokeWidth={2}/></span>
              <span className="kpi-pill-n">{kpi.active_heads}</span>
              <span>Heads</span>
            </span>
            <span className="kpi-pill" title="Active Subheads">
              <span className="kpi-pill-icon"><Icon name="folder-tree" size={11} strokeWidth={2}/></span>
              <span className="kpi-pill-n">{kpi.active_subheads}</span>
              <span>Subheads</span>
            </span>
          </div>
        </div>
      </div>

      <div className="kpi-cell" style={{ animationDelay: '70ms' }}>
        <div className="kpi-eyebrow">
          <span className="kpi-eyebrow-icon"><Icon name="wallet" size={11} strokeWidth={2}/></span>
          Total Monthly Bonus
        </div>
        <div className="kpi-block">
          <div className="kpi-bonus-head">
            <div className="kpi-bonus-number">
              <CountUpCurrency value={released}/>
            </div>
            <div className="kpi-bonus-of">
              of {formatINRCompact(monthlyLimit)} budget · {Math.round(pctOfLimit)}%
            </div>
          </div>
          <div className="kpi-bonus-progress" aria-hidden="true">
            <div style={{ width: pctOfLimit + '%' }}/>
          </div>
          <div className="kpi-breakdown">
            <div className="kpi-stat released">
              <div className="kpi-stat-top"><span className="kpi-stat-dot"/>Released</div>
              <div className="kpi-stat-value">{formatINRCompact(released)}</div>
              <div className="kpi-stat-sub">100%</div>
            </div>
            <div className="kpi-stat consumed">
              <div className="kpi-stat-top"><span className="kpi-stat-dot"/>Consumed</div>
              <div className="kpi-stat-value">{formatINRCompact(consumed)}</div>
              <div className="kpi-stat-sub">{released > 0 ? Math.round((consumed / released) * 100) : 0}%</div>
            </div>
            <div className="kpi-stat pending">
              <div className="kpi-stat-top"><span className="kpi-stat-dot"/>Pending</div>
              <div className="kpi-stat-value">{formatINRCompact(pending)}</div>
              <div className="kpi-stat-sub">{released > 0 ? Math.round((pending / released) * 100) : 0}%</div>
            </div>
            <div className="kpi-stat forfeit">
              <div className="kpi-stat-top"><span className="kpi-stat-dot"/>Forfeit</div>
              <div className="kpi-stat-value">{formatINRCompact(forfeit)}</div>
              <div className="kpi-stat-sub">{released > 0 ? Math.round((forfeit / released) * 100) : 0}%</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
