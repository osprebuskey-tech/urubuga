import { beforeEach, describe, expect, it } from 'vitest';
import { getToken, isPersistent, setToken } from './session';

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

describe('session storage', () => {
  it('keeps an ordinary session for this tab only', () => {
    setToken('a.b.c');
    expect(getToken()).toBe('a.b.c');
    expect(sessionStorage.getItem('imbehe.token')).toBe('a.b.c');
    expect(localStorage.getItem('imbehe.token')).toBeNull();
    expect(isPersistent()).toBe(false);
  });

  it('keeps a "keep me signed in" session across visits', () => {
    setToken('a.b.c', true);
    expect(localStorage.getItem('imbehe.token')).toBe('a.b.c');
    expect(sessionStorage.getItem('imbehe.token')).toBeNull();
    expect(getToken()).toBe('a.b.c');
    expect(isPersistent()).toBe(true);
  });

  it('never leaves the old token behind when it is replaced', () => {
    setToken('old.old.old', true);
    setToken('new.new.new', false);
    expect(localStorage.getItem('imbehe.token')).toBeNull();
    expect(getToken()).toBe('new.new.new');
  });

  it('logging out clears both places', () => {
    setToken('a.b.c', true);
    setToken(null);
    expect(getToken()).toBeNull();
    expect(localStorage.length + sessionStorage.length).toBe(0);
  });
});
