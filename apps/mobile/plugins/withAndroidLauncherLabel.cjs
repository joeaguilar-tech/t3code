const { AndroidConfig, withStringsXml } = require("expo/config-plugins");

module.exports = function withAndroidLauncherLabel(config, { displayName }) {
  return withStringsXml(config, (cfg) => {
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [AndroidConfig.Resources.buildResourceItem({ name: "app_name", value: displayName })],
      cfg.modResults,
    );
    return cfg;
  });
};
