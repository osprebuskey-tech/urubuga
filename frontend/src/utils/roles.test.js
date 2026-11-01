import { describe, expect, it } from 'vitest';
import { effectiveRoles, userHasRole } from './roles';
import { toCsv } from './csv';

describe('roles', () => {
  it('treats a super administrator as an administrator too, as the API does', () => {
    expect(userHasRole({ roles: ['super_admin'] }, 'admin')).toBe(true);
    expect(effectiveRoles(['super_admin'])).toEqual(['super_admin', 'admin']);
  });

  it('does not let administrators or the follow-up role become super administrators', () => {
    expect(userHasRole({ roles: ['admin'] }, 'super_admin')).toBe(false);
    expect(userHasRole({ roles: ['finance'] }, 'super_admin', 'admin')).toBe(false);
  });

  it('does not make a super administrator a provider or customer', () => {
    expect(userHasRole({ roles: ['super_admin'] }, 'provider', 'customer', 'finance')).toBe(false);
  });

  it('copes with no user', () => {
    expect(userHasRole(null, 'admin')).toBe(false);
  });
});

describe('CSV export', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv(['Name', 'Note'], [['Eric, Ltd', 'said "hi"\nbye']])).toBe('Name,Note\r\n"Eric, Ltd","said ""hi""\nbye"');
  });

  it('defuses spreadsheet formulas in names typed by users', () => {
    expect(toCsv(['Name'], [['=HYPERLINK("http://evil")'], ['+1'], ['@sum'], ['-2'], ['Normal']])).toBe('Name\r\n"\'=HYPERLINK(""http://evil"")"\r\n\'+1\r\n\'@sum\r\n\'-2\r\nNormal');
  });

  it('writes empty cells for missing values and keeps zero', () => {
    expect(toCsv(['a', 'b', 'c'], [[null, undefined, 0]])).toBe('a,b,c\r\n,,0');
  });
});
