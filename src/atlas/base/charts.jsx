import { useState } from 'react';
import { fmt } from './format.js';

/* Tooltip shared by the charts: one floating label that follows the pointer. */
export function useTip() {
  const [tip, setTip] = useState(null);
  const show = (e, html) => setTip({ x: Math.min(e.clientX + 16, innerWidth - 250), y: e.clientY + 16, html });
  const hide = () => setTip(null);
  const node = tip && <div className="nx-tip" style={{ left: tip.x, top: tip.y }}>{tip.html}</div>;
  return { show, hide, node };
}

/* Horizontal bars with the value and the change next to the name. */
export function BarList({ rows, max, onPick, focus }) {
  const top = max ?? Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="nx-bars">
      {rows.map((r, i) => (
        <button key={r.key ?? r.name} type="button" className={'nx-bar' + (r.name === focus ? ' hl' : '') + (r.gap ? ' gap' : '')} onClick={() => onPick?.(r)} title={r.title}>
          <span className="nx-bar-name"><i>{r.rank ?? i + 1}</i>{r.label ?? r.name}</span>
          <span className="nx-bar-track"><span className="nx-bar-fill" style={{ transform: `scaleX(${Math.max(.004, r.value / top)})`, animationDelay: i * 45 + 'ms' }} /></span>
          <span className="nx-bar-val">{r.valueText ?? fmt(r.value)}</span>
          <span className={'nx-bar-delta ' + (r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : '')}>{r.deltaText}</span>
        </button>
      ))}
    </div>
  );
}

/* Gainers and losers around a centre line. */
export function Diverging({ rows, onPick }) {
  const max = Math.max(1e-6, ...rows.map(r => Math.abs(r.value)));
  return (
    <div className="nx-div">
      {rows.map((r, i) => (
        <button key={r.name} type="button" className="nx-div-row" onClick={() => onPick?.(r)}>
          <span className="nx-div-name">{r.label}</span>
          <span className="nx-div-track">
            <span className={'nx-div-fill ' + (r.value >= 0 ? 'pos' : 'neg')} style={{ width: Math.abs(r.value) / max * 50 + '%', [r.value >= 0 ? 'left' : 'right']: '50%', animationDelay: i * 50 + 'ms' }} />
          </span>
          <span className={'nx-div-val ' + (r.value >= 0 ? 'up' : 'down')}>{r.text}</span>
        </button>
      ))}
    </div>
  );
}

