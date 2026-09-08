import { describe, expect, it } from 'vitest';
import { DEFAULT_URL_STATE, decode, encode, type UrlState } from './urlState';

const FULL: UrlState = {
  situation: {
    level: 'adult',
    runners: { first: true, second: false, third: true },
    outs: 2,
    posture: 'cornersIn',
    batterHand: 'L',
  },
  ball: 'bunt',
  at: { x: -27.4, y: 87.2 },
  outcome: 'fielded',
};

describe('url state', () => {
  it('round-trips a complete scenario', () => {
    expect(decode(encode(FULL))).toEqual(FULL);
  });

  it('round-trips a scenario with no ball picked yet', () => {
    const partial = { ...DEFAULT_URL_STATE, ball: 'fly' as const };
    expect(decode(encode(partial))).toEqual(partial);
  });

  it('falls back to defaults on an empty query', () => {
    expect(decode('')).toEqual(DEFAULT_URL_STATE);
  });

  it('rejects junk rather than passing it to the engine', () => {
    const s = decode('lvl=martian&r=99&o=7&d=hexagon&bh=Q&b=frisbee&x=abc&y=1&res=exploded');
    expect(s).toEqual(DEFAULT_URL_STATE);
  });

  it('drops a location outside any plausible park', () => {
    expect(decode('x=9000&y=9000').at).toBeNull();
  });

  it('keeps a valid field even when its neighbours are junk', () => {
    const s = decode('lvl=adult&o=nope&r=4');
    expect(s.situation.level).toBe('adult');
    expect(s.situation.runners).toEqual({ first: false, second: false, third: true });
    expect(s.situation.outs).toBe(DEFAULT_URL_STATE.situation.outs);
  });
});
