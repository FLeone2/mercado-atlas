import { titleCase } from './format.js';

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
const cls = c => (c == null || Math.abs(c) < .0005 ? '' : c > 0 ? 'up' : 'down');

