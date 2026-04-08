/*
  Unit tests for check-balance.js (check-balance command).
*/

// npm libraries
import { assert } from 'chai'
import sinon from 'sinon'

// Mocking data libraries
import {
  mockAxiosUnauthorizedError,
  mockUserWithCredit
} from '../mocks/api-mocks.js'
import {
  mockSessionCheckBalance,
  mockSessionCheckBalanceAxiosError,
  mockSessionCheckBalanceNoJwt
} from '../mocks/session-mocks.js'

// Unit under test
import CheckBalance from '../../../src/commands/check-balance.js'

const uut = new CheckBalance()

describe('#check-balance.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#run', () => {
    it('should GET /users/:id with Bearer JWT and print credits', async () => {
      sandbox.stub(console, 'log')

      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'get').resolves({ data: mockUserWithCredit })

      const result = await uut.run({})

      assert.equal(result, true)
      sinon.assert.calledOnceWithExactly(
        uut.axios.get,
        sinon.match(/\/users\/user-id-1$/),
        { headers: { Authorization: 'Bearer test-jwt' } }
      )
      sinon.assert.calledWith(console.log, 'Available credits: 100')
    })

    it('should return 0 when session has no JWT', async () => {
      sandbox.stub(console, 'log')
      const get = sandbox.stub(uut.axios, 'get').resolves({ data: {} })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalanceNoJwt)

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.notCalled(get)
    })

    it('should return 0 on axios error and print response body', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalanceAxiosError)

      sandbox.stub(uut.axios, 'get').rejects(mockAxiosUnauthorizedError)

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'Unauthorized' }, null, 2)
      )
    })

    it('should return 0 when JWT present but user id is missing', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'only-jwt',
        user: {},
        projects: []
      })

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in check-balance/run(): ',
        'No user id in session. Run login again.'
      )
    })

    it('should return 0 and log generic error when err has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.axios, 'get').rejects(Object.create(null))

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in check-balance/run(): ',
        undefined
      )
    })
  })
})
