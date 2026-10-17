/* One identity color per brand, used by every chart on every tab.
   The first twelve brands by volume own a fixed slot of the 12-hue brand palette
   (--brand-1..12, defined in design-system.css for light and dark). Any other
   brand hashes into the same palette, so the color never depends on rank,
   selection, period or chart. Mitsubishi is always the red --mitsubishi-color.
   With more than eight series, hues alone are not enough for color-vision
   deficiency, so charts also carry direct labels and hover emphasis.
   Embedded in both script scopes: the Data app runtime (inside the theme
   registry block) and the authored app (before useMarketData). */
var BRAND_COLOR_SLOTS = {FIAT: 1, VW: 2, BYD: 3, GM: 4, HYUNDAI: 5, TOYOTA: 6, RENAULT: 7, JEEP: 8, HONDA: 9, 'CAOA CHERY': 10, GWM: 11, NISSAN: 12};
var BRAND_COLOR_ALIASES = {VOLKSWAGEN: 'VW', CHEVROLET: 'GM', 'GENERAL MOTORS': 'GM', CHERY: 'CAOA CHERY'};
function brandColorKey(name) {
  var key = String(name == null ? '' : name).trim().toUpperCase();
  return BRAND_COLOR_ALIASES[key] || key;
}
function brandColorKnown(name) {
  var key = brandColorKey(name);
  return key === 'MITSUBISHI' || Object.prototype.hasOwnProperty.call(BRAND_COLOR_SLOTS, key);
}
function brandColor(name) {
  var key = brandColorKey(name);
  if (key === 'MITSUBISHI') return 'var(--mitsubishi-color)';
  var slot = BRAND_COLOR_SLOTS[key];
  if (!slot) {
    var hash = 2166136261;
    for (var i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
    slot = 1 + hash % 12;
  }
  return 'var(--brand-' + slot + ')';
}
if (typeof module !== 'undefined' && module.exports) module.exports = {brandColor, brandColorKnown, brandColorKey, BRAND_COLOR_SLOTS};
