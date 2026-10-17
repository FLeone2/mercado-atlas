// Same data as mercado-automotivo-2: every cube, origin cube, geography file and the
// manifest match the SHA-256 baseline copied from it.
const assert = require('assert');
require('./lib/data-baseline.cjs').assertDataUnchanged(assert);
console.log('PASS data identical to the baseline');
