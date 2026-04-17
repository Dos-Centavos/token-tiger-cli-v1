/*
  Unit tests for create-user.js (create-user command).
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Mocking data libraries
import { mockAuthSuccessResponse } from '../mocks/auth-mocks.js'

// Unit under test
import CreateUser from '../../../src/commands/create-user.js'

const uut = new CreateUser()

describe('#create-user.js', () => {
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

  describe('#createUser', () => {
    it('should POST /users, save session, and log success', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').resolves(mockAuthSuccessResponse)
      const save = sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      const result = await uut.createUser('user.json', 'a@b.com', 'secret')

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
      sinon.assert.calledWith(uut.axios.post, sinon.match(/\/users$/), {
        user: {
          email: 'a@b.com',
          password: 'secret'
        }
      })
      sinon.assert.calledWith(console.log, 'User created successfully!')
    })

    it('should use api base URL without trailing slash', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').resolves(mockAuthSuccessResponse)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      const orig = uut.config.apiBaseUrl
      uut.config.apiBaseUrl = 'http://localhost:5001/'
      try {
        await uut.createUser('user.json', 'a@b.com', 'secret')
        sinon.assert.calledWith(
          uut.axios.post,
          'http://localhost:5001/users',
          sinon.match.object
        )
      } finally {
        uut.config.apiBaseUrl = orig
      }
    })

    it('should log and rethrow on API error without response body', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.axios, 'post').rejects(new Error('network'))

      try {
        await uut.createUser('user.json', 'a@b.com', 'secret')
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'network')
      }
      sinon.assert.calledWith(console.log, 'Error in createUser().', 'network')
    })

    it('should log response body JSON and rethrow on API error', async () => {
      sandbox.stub(console, 'log')
      const apiErr = new Error('bad request')
      apiErr.response = { data: { message: 'Email taken' } }
      sandbox.stub(uut.axios, 'post').rejects(apiErr)

      try {
        await uut.createUser('user.json', 'a@b.com', 'secret')
        assert.fail('expected throw')
      } catch (err) {
        assert.equal(err, apiErr)
      }
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ message: 'Email taken' }, null, 2)
      )
    })
  })

  describe('#run', () => {
    it('should return true when createUser succeeds', async () => {
      sandbox.stub(uut, 'createUser').resolves(true)

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

    it('should return 0 when createUser throws', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut, 'createUser').rejects(new Error('boom'))

      const result = await uut.run({
        email: 'a@b.com',
        password: 'secret'
      })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'boom')
    })

    it('should return 0 when createUser throws without message', async () => {
      sandbox.stub(console, 'log')
      const bare = new Error('bare')
      delete bare.message
      sandbox.stub(uut, 'createUser').rejects(bare)

      const result = await uut.run({
        email: 'a@b.com',
        password: 'secret'
      })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in create-user.js/run(): ',
        bare
      )
    })
  })
})
