/**
 * Android system navigation bar in the app's own surface colour.
 *
 * Without this Android paints a black strip under every screen (the "gap"
 * below the tab bar). The app is not edge-to-edge (many screens don't pad for
 * the bottom inset), so instead the bar takes the tab bar colour from
 * lib/theme.ts (C.tabBar): white with dark buttons, and in dark mode
 * #211d1b with light buttons (values-night).
 */
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidColors, withAndroidColorsNight, withAndroidStyles, withDangerousMod } = require('@expo/config-plugins');

const LIGHT = '#ffffff';
const DARK = '#211d1b';
const COLOR = 'navigationBarColor';
const LIGHT_BUTTONS = 'nabz_light_navigation_bar';

const setColor = (colors, value) => AndroidConfig.Colors.setColorItem(AndroidConfig.Resources.buildResourceItem({ name: COLOR, value }), colors);

function writeBool(resDir, folder, value) {
  const dir = path.join(resDir, folder);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'nabz_navigation_bar.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <bool name="${LIGHT_BUTTONS}">${value}</bool>\n</resources>\n`);
}

module.exports = function withNavigationBarTheme(config) {
  config = withAndroidColors(config, (c) => { c.modResults = setColor(c.modResults, LIGHT); return c; });
  config = withAndroidColorsNight(config, (c) => { c.modResults = setColor(c.modResults, DARK); return c; });
  config = withAndroidStyles(config, (c) => {
    const parent = AndroidConfig.Styles.getAppThemeGroup();
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, { add: true, parent, name: `android:${COLOR}`, value: `@color/${COLOR}` });
    c.modResults = AndroidConfig.Styles.assignStylesValue(c.modResults, { add: true, parent, name: 'android:windowLightNavigationBar', value: `@bool/${LIGHT_BUTTONS}` });
    return c;
  });
  return withDangerousMod(config, ['android', (c) => {
    const res = path.join(c.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res');
    writeBool(res, 'values', 'true');
    writeBool(res, 'values-night', 'false');
    return c;
  }]);
};
