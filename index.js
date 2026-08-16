/**
 * dsh-token-pulse — npm entry point.
 *
 * Exports the two plugin halves as plain strings, ready to be passed as
 * `code.host` and `code.client` when installing the plugin dynamically into a
 * DeepSeek Harness session (see README.md for the full install steps).
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

/** Host half source (the `code.host` function body). */
export const host = readFileSync(join(dir, 'host.js'), 'utf8')

/** Client half source (the `code.client` function body). */
export const client = readFileSync(join(dir, 'client.js'), 'utf8')
