/*
  Integration tests for the Token Tiger CLI (real process, no stubs).
*/

// npm libraries
import { execSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

import { assert } from 'chai'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.join(__dirname, '..', '..')
const cliEntry = path.join(projectRoot, 'token-tiger-cli.js')

describe('#token-tiger-cli.js', () => {
  describe('#info', () => {
    it('should print API base URL and login rows', () => {
      const out = execSync(`node "${cliEntry}" info`, {
        encoding: 'utf8',
        cwd: projectRoot
      })

      assert.include(out, 'API base URL')
      assert.include(out, 'Login')
    })
  })
})
