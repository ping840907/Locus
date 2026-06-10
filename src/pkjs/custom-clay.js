// Custom Clay function: master/slave relationships between settings.
// This runs inside the Clay config page (it is stringified and injected), so
// it must be self-contained and only use `this` (the ClayConfig) and the Clay
// item API.
module.exports = function(minified) {
  var clayConfig = this;

  function setVisible(item, visible) {
    if (item) { visible ? item.show() : item.hide(); }
  }

  // Show the fixed lat/lon only when "Use a fixed location" is selected, and
  // hide the location-check interval and refresh distance in fixed mode
  // (nothing moves, so there is nothing to re-check or re-download for).
  function toggleLocationItems() {
    var fixed = String(this.get()) === '1';
    setVisible(clayConfig.getItemByMessageKey('FIXED_LAT'), fixed);
    setVisible(clayConfig.getItemByMessageKey('FIXED_LON'), fixed);
    setVisible(clayConfig.getItemByMessageKey('UPDATE_INTERVAL'), !fixed);
    setVisible(clayConfig.getItemByMessageKey('UPDATE_DISTANCE'), !fixed);
  }

  // Show the date colour only when the date is enabled.
  function toggleDateColor() {
    setVisible(clayConfig.getItemByMessageKey('DATE_COLOR'), this.get());
  }

  clayConfig.on(clayConfig.EVENTS.AFTER_BUILD, function() {
    var modeItem = clayConfig.getItemByMessageKey('LOCATION_MODE');
    if (modeItem) {
      toggleLocationItems.call(modeItem);   // set initial visibility
      modeItem.on('change', toggleLocationItems);
    }

    var dateItem = clayConfig.getItemByMessageKey('SHOW_DATE');
    if (dateItem) {
      toggleDateColor.call(dateItem);
      dateItem.on('change', toggleDateColor);
    }

    // The colour pickers (COLOR) vs tone selects (BW) are shown per platform by
    // Clay's own `capabilities` field on those items - no custom code needed.
  });
};
