// Custom Clay function: master/slave relationships between settings.
// This runs inside the Clay config page (it is stringified and injected), so
// it must be self-contained and only use `this` (the ClayConfig) and the Clay
// item API.
module.exports = function(minified) {
  var clayConfig = this;

  // Show the fixed lat/lon only when "Use a fixed location" is selected, and
  // hide the location-check interval in fixed mode (nothing moves, so there is
  // nothing to re-check).
  function toggleLocationItems() {
    var fixed = String(this.get()) === '1';

    var lat = clayConfig.getItemByMessageKey('FIXED_LAT');
    var lon = clayConfig.getItemByMessageKey('FIXED_LON');
    var interval = clayConfig.getItemByMessageKey('UPDATE_INTERVAL');

    if (lat) { fixed ? lat.show() : lat.hide(); }
    if (lon) { fixed ? lon.show() : lon.hide(); }
    if (interval) { fixed ? interval.hide() : interval.show(); }
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var modeItem = clayConfig.getItemByMessageKey('LOCATION_MODE');
    if (modeItem) {
      toggleLocationItems.call(modeItem);   // set initial visibility
      modeItem.on('change', toggleLocationItems);
    }
  });
};
