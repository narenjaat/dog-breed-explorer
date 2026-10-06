import { toSafeExternalUrl } from '@/utils/url';

describe('toSafeExternalUrl', () => {
  it.each([
    'https://commons.wikimedia.org/wiki/File:Dog.jpg',
    'http://creativecommons.org/licenses/by-sa/4.0/',
    'HTTPS://example.com',
  ])('allows web link %s', (url) => {
    expect(toSafeExternalUrl(url)).toBe(url);
  });

  it('trims surrounding whitespace', () => {
    expect(toSafeExternalUrl('  https://example.com/a  ')).toBe('https://example.com/a');
  });

  it.each([
    'intent://scan/#Intent;scheme=zxing;end',
    // eslint-disable-next-line no-script-url -- the hostile input under test
    'javascript:alert(1)',
    'tel:+911234567890',
    'file:///data/data/app/db.sqlite',
    'otherapp://open?token=abc',
    'https://',
    'https:// example.com',
    'example.com',
    '',
  ])('rejects %p', (url) => {
    expect(toSafeExternalUrl(url)).toBeNull();
  });

  it('passes null through', () => {
    expect(toSafeExternalUrl(null)).toBeNull();
  });
});
