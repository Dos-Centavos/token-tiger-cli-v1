/*
  Unit tests for app-utils.js.
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Unit under test
import AppUtils from '../../../src/lib/app-utils.js'

const uut = new AppUtils()

describe('#app-utils.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#sleep', () => {
    it('should resolve after the given delay', async () => {
      await uut.sleep(1)
    })
  })

  describe('#getSessionInfo', () => {
    it('should throw when filename is missing', async () => {
      sandbox.stub(console, 'log')
      try {
        await uut.getSessionInfo('')
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'filename must be a string')
      }
    })

    it('should throw when user data file does not exist', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(false)

      try {
        await uut.getSessionInfo('user.json')
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'User data not found')
      }
    })

    it('should return session and default projects when absent', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'readFileSync').returns(
        JSON.stringify({ JWT: 't', user: {} })
      )

      const session = await uut.getSessionInfo('user.json')

      assert.deepEqual(session.projects, [])
    })

    it('should preserve projects when present', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'readFileSync').returns(
        JSON.stringify({
          JWT: 't',
          projects: ['p1'],
          user: {}
        })
      )

      const session = await uut.getSessionInfo('user.json')

      assert.deepEqual(session.projects, ['p1'])
    })

    it('should log and rethrow when file read or JSON parse fails', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'readFileSync').throws(new Error('bad read'))

      try {
        await uut.getSessionInfo('user.json')
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'Could not open')
      }
      sinon.assert.calledWith(console.log, 'Error in getJWT().')
    })

    it('should not log getJWT error line when error code is EEXIT', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      const err = new Error('exit')
      err.code = 'EEXIT'
      sandbox.stub(uut.fs, 'readFileSync').throws(err)

      try {
        await uut.getSessionInfo('user.json')
        assert.fail('expected throw')
      } catch (e) {
        assert.equal(e.code, 'EEXIT')
      }
      sinon.assert.notCalled(console.log)
    })
  })

  describe('#saveUserData', () => {
    it('should throw when filename is missing', () => {
      assert.throws(() => uut.saveUserData('', {}), /filename must be a string/)
    })

    it('should mkdir when user-data dir is missing then write file', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(false)
      const mkdir = sandbox.stub(uut.fs, 'mkdirSync')
      const writeFile = sandbox.stub(uut.fs, 'writeFile').callsFake((_p, _d, cb) => cb())

      await uut.saveUserData('user.json', { x: 1 })

      sinon.assert.calledWith(mkdir, sinon.match.string, { recursive: true })
      sinon.assert.calledOnce(writeFile)
    })

    it('should resolve when write succeeds', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'writeFile').callsFake((_p, _d, cb) => cb())

      await uut.saveUserData('user.json', { a: 1 })

      sinon.assert.calledOnce(uut.fs.writeFile)
    })

    it('should reject when write fails', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(console, 'error')
      const writeErr = new Error('disk full')
      sandbox.stub(uut.fs, 'writeFile').callsFake((_p, _d, cb) => cb(writeErr))

      try {
        await uut.saveUserData('user.json', {})
        assert.fail('expected reject')
      } catch (err) {
        assert.equal(err, writeErr)
      }
    })
  })
})
