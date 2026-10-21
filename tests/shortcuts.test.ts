import { describe, expect, it } from 'vitest';
import {
  CHROME_MAX_SUGGESTED_KEYS,
  COMMAND_SPECS,
  defaultShortcuts,
  toManifestCommands,
} from '../lib/shortcuts';
import { KNOWN_COMMANDS } from '../lib/messaging';

/**
 * Regression guard for the v1.0.0 load failure:
 *
 *     Too many shortcuts specified for 'commands': The maximum is 4.
 *
 * Chrome rejects the whole extension at load time when more than four commands
 * declare a `suggested_key`, so this is checked against the generated manifest
 * rather than the table, to also catch a regression in `toManifestCommands`.
 */
describe('manifest commands', () => {
  const manifest = toManifestCommands();
  const entries = Object.entries(manifest);
  const keyed = entries.filter(([, value]) => value.suggested_key !== undefined);

  it('stays within Chrome\u2019s suggested_key limit', () => {
    expect(keyed.length).toBeLessThanOrEqual(CHROME_MAX_SUGGESTED_KEYS);
    expect(CHROME_MAX_SUGGESTED_KEYS).toBe(4);
  });

  it('declares every command with a description', () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, value] of entries) {
      expect(id.length).toBeGreaterThan(0);
      expect(value.description.length).toBeGreaterThan(0);
    }
  });

  it('never emits an empty suggested_key object', () => {
    // `suggested_key: {}` or `{default: ''}` is rejected by Chrome; commands
    // without a default must omit the property entirely.
    for (const [, value] of entries) {
      if (value.suggested_key === undefined) continue;
      expect(typeof value.suggested_key.default).toBe('string');
      expect(value.suggested_key.default.length).toBeGreaterThan(0);
    }
  });

  it('uses unique shortcuts', () => {
    const keys = keyed.map(([, value]) => value.suggested_key!.default.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses Alt-based shortcuts that Chrome accepts', () => {
    // Chrome requires modifiers; a bare key is rejected at load time.
    for (const [, value] of keyed) {
      expect(value.suggested_key!.default).toMatch(/^(Ctrl|Alt|Command|MacCtrl)(\+(Shift|Alt|Ctrl|Command))*\+[A-Za-z0-9=+\-[\];',./`]$/);
    }
  });

  it('keeps zoom and auto-fit assignable but not default-bound', () => {
    // They already have gestures (Ctrl/Alt+wheel) or a panel button, so the
    // scarce default slots go to actions with no other one-gesture path.
    expect(manifest['zoom-in'].suggested_key).toBeUndefined();
    expect(manifest['zoom-out'].suggested_key).toBeUndefined();
    expect(manifest['toggle-autofit'].suggested_key).toBeUndefined();
    // but they must still exist so users can bind them
    expect(manifest['zoom-in']).toBeDefined();
    expect(manifest['toggle-autofit']).toBeDefined();
  });

  it('lists exactly the four surviving defaults', () => {
    expect(defaultShortcuts().map((entry) => entry.id).sort()).toEqual(
      ['reset-transform', 'rotate-ccw', 'rotate-cw', 'toggle-panel'].sort(),
    );
  });
});

describe('command table consistency', () => {
  it('matches the known command vocabulary used by background/content', () => {
    // Every manifest command must be understood by the content script, otherwise
    // pressing the shortcut is a silent no-op.
    for (const spec of COMMAND_SPECS) {
      expect(KNOWN_COMMANDS).toContain(spec.id);
    }
  });

  it('has no duplicate command ids', () => {
    const ids = COMMAND_SPECS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
