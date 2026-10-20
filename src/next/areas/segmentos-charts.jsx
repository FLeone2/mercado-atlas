import { fmt, pct, pp, titleCase } from '../format.js';

/* Nomes em português para os códigos da base. */
const PORTE = {
  'SUB-SMALL': 'Subcompacto', SMALL: 'Pequeno', COMPACT: 'Compacto', MID: 'Médio', 'UPPER-MID': 'Médio-grande', LARGE: 'Grande', 'LARGE PLUS': 'Grande superior', MICRO: 'Micro',
  'PICK-UP SMALL': 'Picape pequena', 'PICK-UP COMPACT': 'Picape compacta', 'PICK-UP MID': 'Picape média', 'PICK-UP LARGE': 'Picape grande',
  'SUB-SMALL VAN': 'Van mini', 'SMALL COMMERCIAL VAN': 'Van pequena', 'COMPACT COMMERCIAL VAN': 'Van compacta', 'MID COMMERCIAL VAN': 'Van média', 'LARGE COMMERCIAL VAN': 'Van grande',
  'EXTRA-LIGHT TRUCK': 'Caminhão extraleve', 'LIGHT TRUCK': 'Caminhão leve', 'SEMI-LIGHT TRUCK': 'Caminhão semileve', 'MINI TRUCK': 'Minicaminhão', 'SMALL TRUCK': 'Caminhão pequeno', 'MID TRUCK': 'Caminhão médio', 'SEMI-HEAVY TRUCK': 'Caminhão semipesado', 'HEAVY TRUCK': 'Caminhão pesado',
  BUS: 'Ônibus', MILITARY: 'Militar', 'OUT PORTFOLIO': 'Fora do portfólio', OLD: 'Antigos',
};
const CARROCERIA = {
  SUV: 'SUV', HATCH: 'Hatch', SEDAN: 'Sedã', 'DOUBLE CAB': 'Picape cabine dupla', 'SINGLE CAB': 'Picape cabine simples', 'EXTENDED CAB': 'Picape cabine estendida', 'PICK-UP LARGE': 'Picape grande',
  CARGO: 'Furgão', MPV: 'Minivan', PASSENGER: 'Van de passageiros', AMBULANCE: 'Ambulância', 'CHASSIS CAB': 'Chassi-cabine', WAGON: 'Perua', COUPE: 'Cupê', CABRIOLET: 'Conversível', SPORT: 'Esportivo', 'OFF-ROAD': 'Fora de estrada', SPECIALITY: 'Especial',
  'EXTRA-LIGHT TRUCK': 'Caminhão extraleve', 'LIGHT TRUCK': 'Caminhão leve', 'SEMI-LIGHT TRUCK': 'Caminhão semileve', 'MINI TRUCK': 'Minicaminhão', 'SMALL TRUCK': 'Caminhão pequeno', 'MID TRUCK': 'Caminhão médio', 'SEMI-HEAVY TRUCK': 'Caminhão semipesado', 'HEAVY TRUCK': 'Caminhão pesado', BUS: 'Ônibus', MILITARY: 'Militar',
};
export const PROPULSAO = { ICE: 'Combustão', MHEV: 'Microhíbrido', HEV: 'Híbrido', PHEV: 'Híbrido plug-in', BEV: 'Elétrico', FCEL: 'Célula de combustível' };
const TIPO = { Auto: 'Automóveis', 'Comercial Leve': 'Comerciais leves', 'Caminhão': 'Caminhões', 'Ônibus': 'Ônibus' };
const CANAL = { VAREJO: 'Varejo', VD: 'Vendas diretas' };
const NONE = /classific|correspond|informado|indeterm/i;

/* Nome de exibição de qualquer grupo, em qualquer dimensão. */
export function groupLabel(dim, name) {
  const s = String(name);
  if (NONE.test(s)) return 'Não classificado';
  const maps = { bd_segmento: PORTE, bd_carroceria: CARROCERIA, propulsao: PROPULSAO, segmento: TIPO, tipo_venda: CANAL };
  const m = maps[dim]; if (m && m[s]) return m[s];
  if (dim === 'subsegmento') return titleCase(s.replace(/^(AU|CL) - /, ''));
  return s === s.toUpperCase() && /[A-Z]{3}/.test(s) ? titleCase(s) : s;
}
export const isUnclassified = label => label === 'Não classificado';

export const LENSES = [
  { id: 'porte', label: 'Porte', dim: 'bd_segmento', noun: 'porte', title: 'Por porte' },
  { id: 'propulsao', label: 'Propulsão', dim: 'propulsao', noun: 'tipo de propulsão', title: 'Por propulsão' },
  { id: 'carroceria', label: 'Carroceria', dim: 'bd_carroceria', noun: 'tipo de carroceria', title: 'Por carroceria' },
  { id: 'tipo', label: 'Tipo de veículo', dim: 'segmento', noun: 'tipo de veículo', title: 'Por tipo de veículo', plural: true },
];

/* Junta nomes brutos que têm o mesmo nome de exibição e calcula participação e variação de forma coerente. */
export function prepGroups(dim, groups, total, previousTotal) {
  const m = new Map();
  for (const g of groups ?? []) {
    if (!(g.count > 0)) continue;
    const label = groupLabel(dim, g.name), e = m.get(label) ?? { label, names: [], count: 0, previous: 0, hasPrev: false };
    e.names.push(g.name); e.count += g.count;
    if (Number.isFinite(g.previous)) { e.previous += g.previous; e.hasPrev = true; }
    m.set(label, e);
  }
  return [...m.values()].map(e => {
    const share = total > 0 ? e.count / total : 0, prevShare = e.hasPrev && previousTotal > 0 ? e.previous / previousTotal : null;
    return { ...e, share, changeRate: e.hasPrev && e.previous > 0 ? e.count / e.previous - 1 : null, shareChange: prevShare == null ? null : share - prevShare, unclassified: isUnclassified(e.label) };
  }).sort((a, b) => b.count - a.count);
}

export const arrow = c => (c == null || !Number.isFinite(c) ? '' : Math.abs(c) < .0005 ? '● 0,0%' : (c > 0 ? '▲ ' : '▼ ') + pct(Math.abs(c), 1));
const cls = c => (c == null || Math.abs(c) < .0005 ? '' : c > 0 ? 'up' : 'down');

/* Ranking: barra de participação, volume e seta de variação. */
export function GroupBars({ rows, highlight, onPick }) {
  const max = Math.max(1e-9, ...rows.map(r => r.share));
  return (
    <div className="nxs-rows">
      {rows.map((r, i) => {
        const on = highlight.length ? r.names.some(n => highlight.includes(n)) : i === 0 && !r.other;
        return (
          <button key={r.label} type="button" className={'nxs-row' + (on ? ' on' : '') + (r.other ? ' other' : '')} disabled={r.other} onClick={() => onPick(r)}
            title={r.other ? undefined : `${fmt(r.count)} emplacamentos${r.shareChange != null ? ' · ' + pp(r.shareChange) + ' de participação' : ''}`}>
            <span className="nxs-name"><i>{r.other ? '' : i + 1}</i><span>{r.label}</span></span>
            <span className="nxs-track"><span className="nxs-fill" style={{ transform: `scaleX(${Math.max(.004, r.share / max)})`, animationDelay: i * 40 + 'ms' }} /></span>
            <span className="nxs-share">{pct(r.share, r.share < .1 ? 1 : 1)}</span>
            <span className="nxs-count">{fmt(r.count)}</span>
            <span className={'nxs-delta ' + cls(r.changeRate)}>{r.changeRate == null && r.count > 0 ? (r.hasPrev ? 'novo' : '') : arrow(r.changeRate)}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Quem vence dentro de cada grupo. */
export function LeaderCards({ cards, active, onPick, brandName }) {
  return (
    <div className="nxs-cards">
      {cards.map((c, i) => (
        <button key={c.label} type="button" className={'nxs-card' + (c.names.some(n => active.includes(n)) ? ' on' : '')} onClick={() => onPick(c)} style={{ animationDelay: i * 50 + 'ms' }}>
          <span className="nxs-card-k">{c.label}<small>{pct(c.groupShare, 1)} do mercado</small></span>
          <span className="nxs-card-lead">{brandName(c.leader.name)}</span>
          <span className="nxs-card-bar"><span style={{ transform: `scaleX(${Math.max(.01, c.leader.share)})` }} /></span>
          <span className="nxs-card-s"><b>{pct(c.leader.share, 0)}</b> do grupo · {fmt(c.leader.count)}</span>
          <span className="nxs-card-next">{c.next.map(n => <span key={n.name}>{brandName(n.name)} <b>{pct(n.share, 0)}</b></span>)}</span>
        </button>
      ))}
    </div>
  );
}
