/*
  Unit tests for export-token.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import { mockAxiosUnauthorizedError } from '../mocks/api-mocks.js'
import { mockSessionCheckBalance } from '../mocks/session-mocks.js'

import ExportToken from '../../../src/commands/export-token.js'

const uut = new ExportToken()

const FLAGS_BASE = {
  collection: '69fb91a82d63e03eba122f9d',
  tokenId:
    '5f2914840d0fd82689bdf0a0f8194ea363b9d4e2bd69b01608e18e1c6b4b9863',
  address: 'simpleledger:qpnty9t0w93fez04h7yzevujpv8pun204qqp0jfafg'
}

describe('#export-token.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw when collection is missing', () => {
      assert.throws(() => uut.validateFlags({ ...FLAGS_BASE, collection: '' }), /collection/)
    })

    it('should throw when token-id is missing', () => {
      assert.throws(() => uut.validateFlags({ ...FLAGS_BASE, tokenId: '' }), /token-id/)
    })

    it('should throw when address is missing', () => {
      assert.throws(() => uut.validateFlags({ ...FLAGS_BASE, address: '' }), /address/)
    })

    it('should throw when address prefix is invalid', () => {
      assert.throws(
        () => uut.validateFlags({ ...FLAGS_BASE, address: 'not-an-address' }),
        /simpleledger|bitcoincash/
      )
    })
  })

  describe('#run', () => {
    it('should POST export/project for hex collection id', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          result: ['deda092e14e19fde014176b7f0ec2d0cbfb31d06b20d7800fd27f10f534d056a']
        }
      })

      const result = await uut.run({ ...FLAGS_BASE })

      assert.equal(result, true)
      sinon.assert.calledOnce(post)
      sinon.assert.calledWith(
        post,
        'http://localhost:5001/token/export/project',
        {
          projectId: FLAGS_BASE.collection,
          tokenId: FLAGS_BASE.tokenId,
          slpAddress: FLAGS_BASE.address
        },
        sinon.match.hasNested('headers.Authorization', 'Bearer test-jwt')
      )
    })

    it('should POST export/sharable for numeric public id', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, result: 'tx-single' }
      })

      const publicId = '71554887419447918178334'
      const result = await uut.run({
        ...FLAGS_BASE,
        collection: publicId
      })

      assert.equal(result, true)
      sinon.assert.calledWith(
        post,
        'http://localhost:5001/token/export/sharable',
        {
          tokenId: FLAGS_BASE.tokenId,
          slpAddress: FLAGS_BASE.address,
          publicId
        },
        sinon.match.any
      )
    })

    it('should accept bitcoincash: destination prefix', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, result: [] }
      })

      await uut.run({
        ...FLAGS_BASE,
        address: 'bitcoincash:qztestxxxxxxxxxxxxxxxxxxxxxxxxxx'
      })

      sinon.assert.calledWithMatch(
        uut.axios.post,
        sinon.match.any,
        sinon.match.has(
          'slpAddress',
          'bitcoincash:qztestxxxxxxxxxxxxxxxxxxxxxxxxxx'
        ),
        sinon.match.any
      )
    })

    it('should return 0 when JWT is missing', async () => {
      sandbox.stub(console, 'log')
      const post = sandbox.stub(uut.axios, 'post')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u' },
        projects: []
      })

      const result = await uut.run({ ...FLAGS_BASE })

      assert.equal(result, 0)
      sinon.assert.notCalled(post)
    })

    it('should return 0 on axios failure', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').rejects(mockAxiosUnauthorizedError)

      const result = await uut.run({ ...FLAGS_BASE })

      assert.equal(result, 0)
    })

    it('should log full response body when result is absent', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, note: 'no result field' }
      })

      const result = await uut.run({ ...FLAGS_BASE })

      assert.equal(result, true)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ success: true, note: 'no result field' }, null, 2)
      )
    })

    it('should return 0 and log generic wrapper when thrown value has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').rejects(403)

      const result = await uut.run({ ...FLAGS_BASE })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in export-token/run(): ',
        403
      )
    })
  })
})
