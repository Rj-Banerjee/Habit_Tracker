// Release builds block plain http, so a phone build can't reach the AI service running
// on a laptop. This allows http to that one address only, and adds nothing when the
// AI service is on https.
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const CONFIG_NAME = 'network_security_config';

function localAiHost(url) {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'http:' ? hostname : null;
  } catch {
    return null;
  }
}

function securityConfig(host) {
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">${host}</domain>
  </domain-config>
</network-security-config>
`;
}

function useSecurityConfig(manifest) {
  manifest.manifest.application[0].$['android:networkSecurityConfig'] = `@xml/${CONFIG_NAME}`;
  return manifest;
}

const withLocalAi = (config) => {
  const host = localAiHost(process.env.EXPO_PUBLIC_AI_URL);
  if (!host) return config;
  const withFile = withDangerousMod(config, [
    'android',
    (modConfig) => {
      const folder = path.join(modConfig.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, `${CONFIG_NAME}.xml`), securityConfig(host));
      return modConfig;
    },
  ]);
  return withAndroidManifest(withFile, (modConfig) => {
    modConfig.modResults = useSecurityConfig(modConfig.modResults);
    return modConfig;
  });
};

module.exports = withLocalAi;
module.exports.localAiHost = localAiHost;
module.exports.securityConfig = securityConfig;
