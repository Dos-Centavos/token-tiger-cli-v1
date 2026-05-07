/*
  Unit tests for show-collections.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import { mockAxiosUnauthorizedError } from '../mocks/api-mocks.js'
import { mockSessionCheckBalance } from '../mocks/session-mocks.js'

import ShowCollections, {
  filterProjectsOwnedByUser,
  resolveProjectOwnerId
} from '../../../src/commands/show-collections.js'

const uut = new ShowCollections()

describe('#show-collections.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#filterProjectsOwnedByUser', () => {
    const sessionWithProjects = {
      user: {
        _id: 'user-a',
        projects: ['p-in-session']
      },
      projects: []
    }

    it('should keep projects whose owner matches user id', () => {
      const list = [
        { _id: 'p1', projectLabel: 'A', owner: 'user-a', tokensType: 1 },
        { _id: 'p2', projectLabel: 'B', owner: 'other', tokensType: 1 }
      ]
      const out = filterProjectsOwnedByUser(list, sessionWithProjects, 'user-a')
      assert.lengthOf(out, 1)
      assert.equal(out[0]._id, 'p1')
    })

    it('should keep projects without owner field when id is in session', () => {
      const list = [
        { _id: 'p-in-session', projectLabel: 'Legacy', tokensType: 65 },
        { _id: 'ghost', projectLabel: 'X', tokensType: 65 }
      ]
      const out = filterProjectsOwnedByUser(
        list,
        sessionWithProjects,
        'user-a'
      )
      assert.lengthOf(out, 1)
      assert.equal(out[0]._id, 'p-in-session')
    })
  })

  describe('#resolveProjectOwnerId', () => {
    it('should resolve nested user id object', () => {
      assert.equal(
        resolveProjectOwnerId({ user: { _id: 'u9' } }),
        'u9'
      )
    })
  })

  describe('#run', () => {
    it('should GET /projects/ then sharable collections and print tables', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const get = sandbox.stub(uut.axios, 'get')
      get.onFirstCall().resolves({
        data: {
          projects: [
            {
              _id: 'pid-1',
              projectLabel: 'Mine',
              tokensType: 1,
              owner: 'user-id-1',
              createdAt: '2024-01-01'
            },
            {
              _id: 'other',
              projectLabel: 'Not mine',
              tokensType: 1,
              owner: 'x'
            }
          ]
        }
      })
      get.onSecondCall().resolves({
        data: {
          success: true,
          nftSharedCollections: [
            {
              publicId: 'pub99',
              collectionLabel: 'Share 1',
              bchAddress: 'bitcoincash:qptest',
              isPublic: true,
              hidden: false
            }
          ]
        }
      })

      const result = await uut.run({})

      assert.equal(result, true)
      sinon.assert.calledTwice(get)
      sinon.assert.calledWithMatch(get.firstCall, /^http:\/\/localhost:5001\/projects\/$/)
      sinon.assert.calledWithMatch(
        get.secondCall,
        /^http:\/\/localhost:5001\/users\/share\/nft\/collections\/$/
      )

      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      assert.include(out, 'Mine')
      assert.include(out, 'Share 1')
      assert.notInclude(out, 'Not mine')
      assert.notInclude(out, 'wif', 'must not leak private key field')
    })

    it('should sort two owned collections by label', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const get = sandbox.stub(uut.axios, 'get')
      get.onFirstCall().resolves({
        data: {
          projects: [
            {
              _id: 'p-z',
              projectLabel: 'Zebra',
              tokensType: 1,
              owner: 'user-id-1'
            },
            {
              _id: 'p-a',
              projectLabel: 'Alpha',
              tokensType: 65,
              owner: 'user-id-1'
            }
          ]
        }
      })
      get.onSecondCall().resolves({
        data: { success: true, nftSharedCollections: [] }
      })

      await uut.run({})

      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      const idxA = out.indexOf('Alpha')
      const idxZ = out.indexOf('Zebra')
      assert.isBelow(idxA, idxZ, 'sort comparator should order Alpha before Zebra')
    })

    it('should return 0 without GET when JWT missing', async () => {
      sandbox.stub(console, 'log')
      const get = sandbox.stub(uut.axios, 'get')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u' },
        projects: []
      })

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.notCalled(get)
    })

    it('should return 0 when user id missing in session', async () => {
      sandbox.stub(console, 'log')
      const get = sandbox.stub(uut.axios, 'get')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'j',
        user: {},
        projects: []
      })

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.notCalled(get)
    })

    it('should show empty placeholders when no collections and no sharables', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const get = sandbox.stub(uut.axios, 'get')
      get.onFirstCall().resolves({
        data: {
          projects: [
            {
              _id: 'other-project',
              projectLabel: 'Foreign',
              tokensType: 1,
              owner: 'someone-else'
            }
          ]
        }
      })
      get.onSecondCall().resolves({
        data: {
          success: true,
          nftSharedCollections: []
        }
      })

      const result = await uut.run({})

      assert.equal(result, true)
      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      assert.include(out, '(none)')
    })

    it('should return 0 and log generic wrapper when thrown value has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      const sym = Symbol('x')
      sandbox.stub(uut.axios, 'get').rejects(sym)

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in show-collections/run(): ',
        sym
      )
    })

    it('should return 0 on axios error', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'get').rejects(mockAxiosUnauthorizedError)

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'Unauthorized' }, null, 2)
      )
    })
  })
})
