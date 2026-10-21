import type { CommandType } from './messaging';

/**
 * The manifest `commands` table.
 *
 * Chrome refuses to *install* an extension when more than four commands declare
 * a `suggested_key`:
 *
 *     Too many shortcuts specified for 'commands': The maximum is 4.
 *
 * That is a load-time error, not a runtime one — the extension never appears in
 * `chrome://extensions`. v1.0.0 declared seven keys (v0.1.0 declared six) and so
 * could not be loaded at all.
 *
 * A command may exist in the manifest without a default key: it still shows up
 * at `chrome://extensions/shortcuts`, where the user can bind it. Only the first
 * four defaults are honoured, so this table caps itself at four on purpose.
 *
 * Selection rule: a command gets a default key only when it has no equivalent
 * gesture or one-click path. Zoom has `Ctrl`/`Alt` + wheel, auto-fit has a panel
 * button, so those stay assignable-only.
 */

/** Chrome's hard limit on commands carrying a `suggested_key`. */
export const CHROME_MAX_SUGGESTED_KEYS = 4;

export interface CommandSpec {
  id: CommandType;
  description: string;
  /** Chrome syntax, e.g. `Alt+Shift+R`. `null` = no default, user-assignable. */
  suggestedKey: string | null;
}

export const COMMAND_SPECS: readonly CommandSpec[] = [
  {
    id: 'toggle-panel',
    description: 'Open or close the Tiltview panel',
    suggestedKey: 'Alt+Shift+T',
  },
  {
    id: 'rotate-cw',
    description: 'Rotate video 90° clockwise',
    suggestedKey: 'Alt+R',
  },
  {
    id: 'rotate-ccw',
    description: 'Rotate video 90° counter-clockwise',
    suggestedKey: 'Alt+Shift+R',
  },
  {
    id: 'reset-transform',
    description: 'Reset all transforms',
    suggestedKey: 'Alt+0',
  },
  {
    id: 'zoom-in',
    description: 'Zoom in',
    suggestedKey: null,
  },
  {
    id: 'zoom-out',
    description: 'Zoom out',
    suggestedKey: null,
  },
  {
    id: 'toggle-autofit',
    description: 'Toggle auto-fit mode',
    suggestedKey: null,
  },
];

export interface ManifestCommand {
  description: string;
  suggested_key?: { default: string };
}

/** Shape consumed by `manifest.commands` in `wxt.config.ts`. */
export function toManifestCommands(): Record<string, ManifestCommand> {
  const commands: Record<string, ManifestCommand> = {};
  for (const spec of COMMAND_SPECS) {
    commands[spec.id] = spec.suggestedKey
      ? { description: spec.description, suggested_key: { default: spec.suggestedKey } }
      : { description: spec.description };
  }
  return commands;
}

/** Commands that ship with a default key. */
export function defaultShortcuts(): { id: CommandType; key: string }[] {
  return COMMAND_SPECS.filter((spec) => spec.suggestedKey !== null).map((spec) => ({
    id: spec.id,
    key: spec.suggestedKey as string,
  }));
}
