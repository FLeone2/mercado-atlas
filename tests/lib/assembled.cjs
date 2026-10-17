// The market script as the build assembles it (src/market/core.js with its
// includes and worker strings expanded), for tests that inspect the shipped code.
const fs = require('fs'), path = require('path');
const MARKET = path.join(__dirname, '../../src/market');
module.exports = function assembled() {
  const read = file => fs.readFileSync(path.join(MARKET, file), 'utf8');
  const expand = text => text
    .replace(/\/\*@include ([^*\s]+)\*\//g, (_, file) => expand(read(file)))
    .replace(/\/\*@string ([^*]+)\*\//g, (_, list) => JSON.stringify(list.split('+').map(f => read(f.trim())).join('\n')));
  return expand(read('core.js'));
};
