import { afterEach, describe, expect, it, vi } from 'vitest';
import { createState, parseState, serializeState, setPaused, startRun, step } from './game';
import { BACKUP_KEY, PauseManager, SAVE_KEY, SaveRepository, TabLock, type StorageLike } from './persistence';
import { LocalPlatformAdapter } from './platform';

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  writes: string[] = [];
  failKey: string | null = null;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error('QuotaExceededError');
    this.writes.push(key); this.values.set(key, value);
  }
  removeItem(key: string) { this.values.delete(key); }
}
const snapshot = (seed = 77) => serializeState(step(startRun(createState(), seed), 35));

describe('SaveRepository integrity and recovery', () => {
  it('creates a fresh profile only when both save keys are absent', () => {
    const storage = new MemoryStorage();
    expect(new SaveRepository(storage).load()).toEqual({ state: null, warning: null, blocked: false });
    expect(storage.writes).toEqual([]);
  });
  it('prefers the current validated snapshot over the older backup', () => {
    const storage = new MemoryStorage();
    storage.values.set(SAVE_KEY, snapshot(1)); storage.values.set(BACKUP_KEY, snapshot(2));
    const loaded = new SaveRepository(storage).load();
    expect(loaded.state?.run?.seed).toBe(1); expect(loaded.warning).toBeNull(); expect(loaded.blocked).toBe(false);
  });
  it.each(['{truncated', '{"version":2}', 'null', ''])('recovers a valid backup when primary is %j without modifying either', primary => {
    const storage = new MemoryStorage(), backup = snapshot(2);
    storage.values.set(SAVE_KEY, primary); storage.values.set(BACKUP_KEY, backup);
    const loaded = new SaveRepository(storage).load();
    expect(loaded.state?.run?.seed).toBe(2); expect(loaded.warning).toBeTruthy(); expect(loaded.blocked).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(primary); expect(storage.getItem(BACKUP_KEY)).toBe(backup); expect(storage.writes).toEqual([]);
  });
  it('recovers a backup if the primary key is absent', () => {
    const storage = new MemoryStorage(); storage.values.set(BACKUP_KEY, snapshot(3));
    const loaded = new SaveRepository(storage).load();
    expect(loaded.state?.run?.seed).toBe(3); expect(loaded.warning).toBeTruthy();
  });
  it.each([
    ['{bad', '{bad'], ['{bad', null], [null, '{bad'], ['', null], [null, ''], ['', ''],
  ])('blocks profile replacement for unrecoverable primary %j and backup %j', (primary, backup) => {
    const storage = new MemoryStorage();
    if (primary !== null) storage.values.set(SAVE_KEY, primary);
    if (backup !== null) storage.values.set(BACKUP_KEY, backup);
    const loaded = new SaveRepository(storage).load();
    expect(loaded.state).toBeNull(); expect(loaded.blocked).toBe(true); expect(loaded.warning).toBeTruthy();
    expect(storage.getItem(SAVE_KEY)).toBe(primary); expect(storage.getItem(BACKUP_KEY)).toBe(backup); expect(storage.writes).toEqual([]);
  });
  it('rejects a structurally invalid primary and loads its validated backup', () => {
    const storage = new MemoryStorage(), invalid = JSON.parse(snapshot()); invalid.run.hp = -4;
    storage.values.set(SAVE_KEY, JSON.stringify(invalid)); storage.values.set(BACKUP_KEY, snapshot(9));
    expect(new SaveRepository(storage).load().state?.run?.seed).toBe(9);
  });
  it('rotates the previous valid primary into backup before writing a new complete snapshot', () => {
    const storage = new MemoryStorage(), old = snapshot(1), next = parseState(snapshot(2))!;
    storage.values.set(SAVE_KEY, old);
    expect(new SaveRepository(storage).save(next)).toBe(true);
    expect(storage.writes).toEqual([BACKUP_KEY, SAVE_KEY]); expect(storage.getItem(BACKUP_KEY)).toBe(old);
    expect(parseState(storage.getItem(SAVE_KEY)!)?.run?.seed).toBe(2);
  });
  it('does not rotate a corrupt primary over a good recovery backup', () => {
    const storage = new MemoryStorage(), backup = snapshot(1);
    storage.values.set(SAVE_KEY, '{broken'); storage.values.set(BACKUP_KEY, backup);
    expect(new SaveRepository(storage).save(parseState(snapshot(2))!)).toBe(true);
    expect(storage.writes).toEqual([SAVE_KEY]); expect(storage.getItem(BACKUP_KEY)).toBe(backup);
  });
  it('refuses an invalid in-memory state without touching primary or backup', () => {
    const storage = new MemoryStorage(), old = snapshot(); storage.values.set(SAVE_KEY, old);
    const invalid = createState(); invalid.profile.crystals = -1;
    expect(new SaveRepository(storage).save(invalid)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(old); expect(storage.writes).toEqual([]);
  });
  it('retains recoverable prior progress when writing the new primary fails', () => {
    const storage = new MemoryStorage(), old = snapshot(1); storage.values.set(SAVE_KEY, old); storage.failKey = SAVE_KEY;
    expect(new SaveRepository(storage).save(parseState(snapshot(2))!)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(old); expect(storage.getItem(BACKUP_KEY)).toBe(old);
    expect(new SaveRepository(storage).load().state?.run?.seed).toBe(1);
  });
  it('does not replace primary if backup rotation fails', () => {
    const storage = new MemoryStorage(), old = snapshot(1); storage.values.set(SAVE_KEY, old); storage.failKey = BACKUP_KEY;
    expect(new SaveRepository(storage).save(parseState(snapshot(2))!)).toBe(false);
    expect(storage.getItem(SAVE_KEY)).toBe(old); expect(storage.writes).toEqual([]);
  });
  it('exports corrupt values exactly and resets only game-owned keys', () => {
    const storage = new MemoryStorage(); storage.values.set(SAVE_KEY, '{broken'); storage.values.set(BACKUP_KEY, ''); storage.values.set('unrelated', 'keep');
    const repository = new SaveRepository(storage);
    expect(JSON.parse(repository.raw())).toEqual({ primary: '{broken', backup: '' });
    repository.reset(); expect(storage.getItem(SAVE_KEY)).toBeNull(); expect(storage.getItem(BACKUP_KEY)).toBeNull(); expect(storage.getItem('unrelated')).toBe('keep');
  });
  it('restores the complete paused snapshot and never advances time on load', () => {
    const storage = new MemoryStorage(), paused = setPaused(step(startRun(createState(), 18), 25), true);
    const repository = new SaveRepository(storage); expect(repository.save(paused)).toBe(true);
    const first = repository.load().state!, second = repository.load().state!;
    expect(first.run?.paused).toBe(true); expect(first.run?.tick).toBe(25); expect(serializeState(first)).toBe(serializeState(paused));
    expect(serializeState(step(second, 30000))).toBe(serializeState(paused));
    first.profile.crystals = 55; expect(second.profile.crystals).toBe(0);
  });
});

describe('independent lifecycle pause reasons', () => {
  it('does not resume until the final nested reason is removed', () => {
    const pause = new PauseManager(); expect(pause.paused).toBe(false);
    pause.add('user'); pause.add('hidden'); pause.add('dialog'); pause.add('hidden');
    pause.remove('hidden'); expect(pause.paused).toBe(true); pause.remove('dialog'); expect(pause.paused).toBe(true);
    pause.remove('missing'); expect(pause.paused).toBe(true); pause.remove('user'); expect(pause.paused).toBe(false);
  });
  it.each(['success', 'cancel', 'error'] as const)('cleans mock ad pause after %s without clearing user pause', async outcome => {
    const pause = new PauseManager(), adapter = new LocalPlatformAdapter(); pause.add('user');
    if (outcome === 'error') await expect(adapter.mockAd(pause, outcome)).rejects.toThrow('Mock ad error');
    else await expect(adapter.mockAd(pause, outcome)).resolves.toBe(outcome);
    expect(pause.reasons.has('platformAd')).toBe(false); expect(pause.reasons.has('user')).toBe(true); expect(pause.paused).toBe(true);
  });
});

describe('exclusive profile writer lock', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('distinguishes missing or denied browser APIs from a busy game', async () => {
    for (const navigator of [
      {},
      Object.defineProperty({}, 'locks', { get: () => { throw new Error('SecurityError'); } }),
      { locks: { request: () => Promise.reject(new Error('disabled')) } },
      { locks: { request: () => { throw new Error('SecurityError'); } } },
    ]) {
      vi.stubGlobal('navigator', navigator);
      expect(await new TabLock().acquire()).toBe('unavailable');
    }
  });
  it('waits briefly for the previous owner but never writes while it holds the lock', async () => {
    vi.useFakeTimers();
    let owner: Promise<void> | undefined;
    const request = (name: string, { signal }: { signal: AbortSignal }, callback: (lock: object) => void | Promise<void>) => {
      const take = () => {
        const promise = Promise.resolve(callback({ name })).finally(() => { if (owner === promise) owner = undefined; });
        owner = promise;
        return promise;
      };
      if (!owner) return take();
      return new Promise<void>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        void owner!.then(() => { if (!signal.aborted) void take().then(resolve, reject); });
      });
    };
    vi.stubGlobal('navigator', { locks: { request } });
    const first = new TabLock(), second = new TabLock();
    expect(await first.acquire()).toBe('acquired');
    const timedOut = second.acquire();
    const denied = expect(timedOut).resolves.toBe('busy');
    await vi.advanceTimersByTimeAsync(1200);
    await denied;
    const waiting = second.acquire();
    first.release();
    await expect(waiting).resolves.toBe('acquired');
    second.release();
    await owner;
  });
});
