// Adds the Android Quick Settings tile. Native code that Expo doesn't generate, so it's
// copied in when the Android project is made.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const SERVICE = '.VoiceTileService';

function addTileService(manifest) {
  const application = manifest.manifest.application[0];
  const services = (application.service ?? []).filter(
    (service) => service.$['android:name'] !== SERVICE
  );
  services.push({
    $: {
      'android:name': SERVICE,
      'android:exported': 'true',
      'android:icon': '@drawable/ic_voice_tile',
      'android:label': 'Log by voice',
      'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
    },
    'intent-filter': [
      { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
    ],
  });
  application.service = services;
  return manifest;
}

function copyNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    (modConfig) => {
      const main = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main');
      const source = path.join(modConfig.modRequest.projectRoot, 'plugins/voice-tile');
      const packagePath = modConfig.android.package.split('.').join('/');
      const copy = (file, folder) => {
        const target = path.join(main, folder);
        fs.mkdirSync(target, { recursive: true });
        fs.copyFileSync(path.join(source, file), path.join(target, file));
      };
      copy('VoiceTileService.kt', path.join('java', packagePath));
      copy('ic_voice_tile.xml', 'res/drawable');
      return modConfig;
    },
  ]);
}

const withVoiceTile = (config) =>
  copyNativeFiles(
    withAndroidManifest(config, (modConfig) => {
      modConfig.modResults = addTileService(modConfig.modResults);
      return modConfig;
    })
  );

module.exports = withVoiceTile;
module.exports.addTileService = addTileService;
