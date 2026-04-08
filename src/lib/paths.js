/*
  Project path helpers (ESM-safe; replaces __dirname/../wallets patterns).
*/

import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** src/lib -> project root */
export const projectRoot = path.join(__dirname, '..', '..')

export const userDataDir = path.join(projectRoot, 'user-data')

export function userDataFilePath (name) {
  return path.join(userDataDir, name)
}
