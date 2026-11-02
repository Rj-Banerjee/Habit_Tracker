import { addTileService } from './withVoiceTile';

const manifest = () => ({ manifest: { application: [{ service: [{ $: { 'android:name': '.Other' } }] }] } });

describe('addTileService', () => {
  it('adds a tile only the system can bind to', () => {
    const [, tile] = addTileService(manifest()).manifest.application[0].service;
    expect(tile.$).toMatchObject({
      'android:name': '.VoiceTileService',
      'android:exported': 'true',
      'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
    });
    expect(tile['intent-filter'][0].action[0].$['android:name']).toBe(
      'android.service.quicksettings.action.QS_TILE'
    );
  });

  it('adds it once however often the project is regenerated', () => {
    const twice = addTileService(addTileService(manifest()));
    expect(twice.manifest.application[0].service).toHaveLength(2);
  });
});
