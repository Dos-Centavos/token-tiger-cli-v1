/*
  Unit tests for paths.js.
*/

// npm libraries
import { assert } from 'chai'
import path from 'path'

// Unit under test
import { userDataDir, userDataFilePath } from '../../../src/lib/paths.js'

describe('#paths.js', () => {
  describe('#userDataFilePath', () => {
    it('should join user-data directory and file name', () => {
      const p = userDataFilePath('user.json')

      assert.equal(p, path.join(userDataDir, 'user.json'))
    })
  })
})
