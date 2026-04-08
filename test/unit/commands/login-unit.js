/*
  Unit tests for login.js (login command).
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Mocking data libraries
import { mockAuthSuccessResponse } from '../mocks/auth-mocks.js'

// Unit under test
import Login from '../../../src/commands/login.js'

const uut = new Login()

describe('#login.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw when email is missing', () => {
      assert.throws(
        () => uut.validateFlags({ password: 'x' }),
        /email/
      )
    })

    it('should throw when email is empty string', () => {
      assert.throws(
        () => uut.validateFlags({ email: '', password: 'x' }),
        /email/
      )
    })

    it('should throw when password is missing', () => {
      assert.throws(
        () => uut.validateFlags({ email: 'a@b.com' }),
        /password/
      )
    })

    it('should return true when email and password are set', () => {
      assert.equal(
        uut.validateFlags({ email: 'a@b.com', password: 'secret' }),
        true
      )
    })
  })

  describe('#login', () => {
    it('should POST /auth, save session, and log success', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').resolves(mockAuthSuccessResponse)
      const save = sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      const result = await uut.login('user.json', 'a@b.com', 'secret')

      assert.equal(result, true)
      sinon.assert.calledOnce(save)
      sinon.assert.calledWith(
        save,
        'user.json',
        sinon.match({
          JWT: 'mock-jwt-token',
          user: mockAuthSuccessResponse.data.user,
          projects: mockAuthSuccessResponse.data.user.projects
        })
      )
      sinon.assert.calledWith(uut.axios.post, sinon.match(/\/auth$/), {
        email: 'a@b.com',
        password: 'secret'
      })
      sinon.assert.calledWith(console.log, 'Login success!')
    })

    it('should use api base URL without trailing slash', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').resolves(mockAuthSuccessResponse)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      const orig = uut.config.apiBaseUrl
      uut.config.apiBaseUrl = 'http://localhost:5001/'
      try {
        await uut.login('user.json', 'a@b.com', 'secret')
        sinon.assert.calledWith(
          uut.axios.post,
          'http://localhost:5001/auth',
          sinon.match.object
        )
      } finally {
        uut.config.apiBaseUrl = orig
      }
    })

    it('should log and rethrow on API error', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').rejects(new Error('network'))

      try {
        await uut.login('user.json', 'a@b.com', 'secret')
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'network')
      }
      sinon.assert.calledWith(console.log, 'Error in login().')
    })
  })

  describe('#run', () => {
    it('should return true when login succeeds', async () => {
      sandbox.stub(uut, 'login').resolves(true)

      const result = await uut.run({
        email: 'a@b.com',
        password: 'secret'
      })

      assert.equal(result, true)
    })

    it('should return 0 and print message when validateFlags fails', async () => {
      sandbox.stub(console, 'log')

      const result = await uut.run({ email: '', password: 'x' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, sinon.match(/email/))
    })

    it('should return 0 when login throws', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut, 'login').rejects(new Error('boom'))

      const result = await uut.run({
        email: 'a@b.com',
        password: 'secret'
      })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'boom')
    })

    it('should return 0 when login throws without message', async () => {
      sandbox.stub(console, 'log')
      const bare = new Error('bare')
      delete bare.message
      sandbox.stub(uut, 'login').rejects(bare)

      const result = await uut.run({
        email: 'a@b.com',
        password: 'secret'
      })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in login.js/run(): ',
        bare
      )
    })
  })
})
