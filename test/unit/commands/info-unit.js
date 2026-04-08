/*
  Unit tests for info.js (info command).
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Mocking data libraries
import {
  mockSessionJwtNoEmail,
  mockSessionNoJwt,
  mockSessionWithJwtAndEmail
} from '../mocks/session-mocks.js'

// Unit under test
import Info from '../../../src/commands/info.js'

const uut = new Info()

describe('#info.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should return true', () => {
      assert.equal(uut.validateFlags({}), true)
    })
  })

  describe('#resolveLoginDisplay', () => {
    it('should return email when session has JWT and user.email', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionWithJwtAndEmail)

      const s = await uut.resolveLoginDisplay()
      assert.equal(s, 'logged in as a@example.com')
    })

    it('should return not logged in when getSessionInfo throws', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').rejects(new Error('missing'))

      const s = await uut.resolveLoginDisplay()
      assert.equal(s, 'not logged in')
    })

    it('should return not logged in when JWT missing', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionNoJwt)

      const s = await uut.resolveLoginDisplay()
      assert.equal(s, 'not logged in')
    })

    it('should return logged in when JWT present but no email', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionJwtNoEmail)

      const s = await uut.resolveLoginDisplay()
      assert.equal(s, 'logged in')
    })
  })

  describe('#run', () => {
    it('should print config table and return true', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut, 'resolveLoginDisplay').resolves('logged in as a@b.com')
      sandbox.stub(uut, 'buildTable').returns('table')

      const result = await uut.run({})

      assert.equal(result, true)
      sinon.assert.calledOnce(uut.buildTable)
      sinon.assert.calledWith(
        uut.buildTable,
        sinon.match({
          apiBaseUrl: uut.config.apiBaseUrl,
          loginDisplay: 'logged in as a@b.com'
        })
      )
    })

    it('should return 0 on error', async () => {
      sandbox.stub(console, 'error')
      sandbox.stub(uut, 'validateFlags').throws(new Error('test error'))

      const result = await uut.run({})

      assert.equal(result, 0)
    })
  })

  describe('#buildTable', () => {
    it('should include base URL and login line', () => {
      sandbox.stub(console, 'log')

      const tableStr = uut.buildTable({
        apiBaseUrl: 'https://example.test',
        loginDisplay: 'logged in as u@example.com'
      })

      assert.isString(tableStr)
      assert.include(tableStr, 'https://example.test')
      assert.include(tableStr, 'logged in as u@example.com')
    })
  })
})
