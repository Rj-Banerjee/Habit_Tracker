import { localAiHost, securityConfig } from './withLocalAi';

describe('localAiHost', () => {
  it('allows http only to the AI service on the laptop', () => {
    expect(localAiHost('http://192.168.29.142:8200')).toBe('192.168.29.142');
  });

  it('allows nothing when the AI service is on https or unset', () => {
    expect(localAiHost('https://ai.example.com')).toBeNull();
    expect(localAiHost(undefined)).toBeNull();
    expect(localAiHost('not a url')).toBeNull();
  });
});

describe('securityConfig', () => {
  it('names that one address and no others', () => {
    const xml = securityConfig('192.168.29.142');
    expect(xml).toContain('<domain includeSubdomains="false">192.168.29.142</domain>');
    expect(xml).not.toContain('base-config');
  });
});
