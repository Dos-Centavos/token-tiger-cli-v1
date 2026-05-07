/*
  Unit tests for show-collection-tokens.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import { mockAxiosUnauthorizedError } from '../mocks/api-mocks.js'
import { mockSessionCheckBalance } from '../mocks/session-mocks.js'

import ShowCollectionTokens from '../../../src/commands/show-collection-tokens.js'
import { classifyCollectionTokenId } from '../../../src/lib/collection-id.js'

const uut = new ShowCollectionTokens()

describe('#show-collection-tokens.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#classifyCollectionTokenId', () => {
    it('should classify 24-char hex as collection', () => {
      const pid = '69fb91a82d63e03eba122f9d'
      assert.deepInclude(classifyCollectionTokenId(pid), {
        kind: 'collection',
        id: pid.toLowerCase()
      })
    })

    it('should classify numeric string as sharable publicId', () => {
      const pub = '71554887419447918178334'
      assert.deepInclude(classifyCollectionTokenId(pub), {
        kind: 'sharable',
        id: pub
      })
    })

    it('should throw on null or undefined id input', () => {
      assert.throws(() => classifyCollectionTokenId(null), /missing|id/i)
      assert.throws(() => classifyCollectionTokenId(undefined), /missing|id/i)
    })

    it('should throw on empty input', () => {
      assert.throws(() => classifyCollectionTokenId(''), /missing|id/i)
    })

    it('should throw on ambiguous non-hex non-numeric ids', () => {
      assert.throws(() => classifyCollectionTokenId('not-an-id'), /Unrecognized/)
    })
  })

  describe('#validateFlags', () => {
    it('should throw when id missing', () => {
      assert.throws(() => uut.validateFlags({}), /id/)
    })
  })

  describe('#run', () => {
    it('should POST token/project-tokens for hex collection id', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          tokens: [{ tokenId: 'tok1', qty: '1', name: 'A' }]
        }
      })
      sandbox.stub(uut.axios, 'get')

      const result = await uut.run({
        id: '69fb91a82d63e03eba122f9d'
      })

      assert.equal(result, true)
      sinon.assert.calledOnce(post)
      sinon.assert.calledWith(
        post,
        'http://localhost:5001/token/project-tokens',
        { projectId: '69fb91a82d63e03eba122f9d' },
        sinon.match.hasNested('headers.Authorization', 'Bearer test-jwt')
      )
      sinon.assert.notCalled(uut.axios.get)
    })

    it('should GET sharable tokens for numeric public id', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post')
      const get = sandbox.stub(uut.axios, 'get').resolves({
        data: {
          tokens: [{ tokenId: 't99', qty: '', ticker: 'X' }]
        }
      })

      const result = await uut.run({ id: '71554887419447918178334' })

      assert.equal(result, true)
      sinon.assert.calledOnce(get)
      sinon.assert.calledWithMatch(
        get,
        /^http:\/\/localhost:5001\/users\/share\/nft\/tokens\/71554887419447918178334$/,
        sinon.match.hasNested('headers.Authorization', 'Bearer test-jwt')
      )
      sinon.assert.notCalled(uut.axios.post)
    })

    it('should return 0 without calling API when JWT missing', async () => {
      sandbox.stub(console, 'log')
      const post = sandbox.stub(uut.axios, 'post')
      const get = sandbox.stub(uut.axios, 'get')

      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u' },
        projects: []
      })

      const result = await uut.run({ id: '69fb91a82d63e03eba122f9d' })

      assert.equal(result, 0)
      sinon.assert.notCalled(post)
      sinon.assert.notCalled(get)
    })

    it('should render rows using txid, qty fallbacks, and name/ticker/symbol/URI', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const longName = 'x'.repeat(70)
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          tokens: [
            null,
            { txid: 'tx-only', qty: null },
            { tokenId: 't2', qty: undefined, ticker: 'TK' },
            { tokenId: 't3', symbol: 'SYM' },
            { tokenId: 't4', documentUri: 'https://doc.example/x' },
            { tokenId: 't5', name: longName }
          ]
        }
      })
      sandbox.stub(uut.axios, 'get')

      const result = await uut.run({
        id: '69fb91a82d63e03eba122f9d'
      })

      assert.equal(result, true)
      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      assert.include(out, 'tx-only')
      assert.include(out, 'TK')
      assert.include(out, 'SYM')
      assert.include(out, 'https://doc.example/x')
      assert.include(out, 'x'.repeat(60))
    })

    it('should show empty-state row when token list is empty', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.axios, 'post').resolves({ data: { tokens: [] } })
      sandbox.stub(uut.axios, 'get')

      const result = await uut.run({
        id: '69fb91a82d63e03eba122f9d'
      })

      assert.equal(result, true)
      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      assert.include(out, '(no tokens)')
    })

    it('should return 0 and log generic wrapper when thrown value has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      const bare = Object.freeze({})
      sandbox.stub(uut.axios, 'post').rejects(bare)

      const result = await uut.run({
        id: '69fb91a82d63e03eba122f9d'
      })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in show-collection-tokens/run(): ',
        bare
      )
    })

    it('should return 0 on axios failure', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').rejects(mockAxiosUnauthorizedError)

      const result = await uut.run({ id: '69fb91a82d63e03eba122f9d' })

      assert.equal(result, 0)
    })
  })
})
