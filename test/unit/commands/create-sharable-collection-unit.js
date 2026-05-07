/*
  Unit tests for create-sharable-collection.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import { mockAxiosUnauthorizedError } from '../mocks/api-mocks.js'
import { mockSessionCheckBalance } from '../mocks/session-mocks.js'

import CreateSharableCollection from '../../../src/commands/create-sharable-collection.js'

const uut = new CreateSharableCollection()

describe('#create-sharable-collection.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should throw when name is missing', () => {
      assert.throws(
        () => uut.validateFlags({}),
        /name/
      )
    })

    it('should throw when name is only whitespace', () => {
      assert.throws(
        () => uut.validateFlags({ name: '   ' }),
        /name/
      )
    })

    it('should accept a valid name', () => {
      assert.equal(uut.validateFlags({ name: 'Sharable Alpha' }), true)
    })
  })

  describe('#run', () => {
    const successUser = (_id = 'uid', collections = [{}]) => ({
      _id,
      email: 'a@b.com',
      nftSharedCollections: collections.slice()
    })

    const makeCreated = () => ({
      collectionLabel: 'My share',
      publicId: 'pub-1',
      bchAddress: 'bitcoincash:qztest'
    })

    it('should POST /users/share/nft/create with isPublic false when --public omitted', async () => {
      sandbox.stub(console, 'log')
      const created = makeCreated()
      const session = {
        ...mockSessionCheckBalance,
        user: { ...mockSessionCheckBalance.user, extra: true }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      const save = sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          user: successUser(mockSessionCheckBalance.user._id, [created])
        }
      })

      const result = await uut.run({ name: '  My share  ' })

      assert.equal(result, true)
      sinon.assert.calledWith(
        uut.axios.post,
        sinon.match(/\/users\/share\/nft\/create$/),
        {
          sharableCollection: {
            collectionLabel: 'My share',
            isPublic: false
          }
        },
        sinon.match.hasNested('headers.Authorization', 'Bearer test-jwt')
      )
      sinon.assert.calledOnce(save)
      assert.deepEqual(save.firstCall.args[1].user.extra, true)
      assert.deepEqual(save.firstCall.args[1].user.nftSharedCollections, [created])
    })

    it('should POST with isPublic true when --public passed', async () => {
      sandbox.stub(console, 'log')
      const created = { ...makeCreated(), isPublic: true }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'j',
        user: { _id: 'u1', projects: [] },
        projects: []
      })
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          user: successUser('u1', [created])
        }
      })

      await uut.run({ name: ' Pvt ', public: true })

      sinon.assert.calledWithMatch(
        uut.axios.post,
        sinon.match.any,
        {
          sharableCollection: sinon.match.has('isPublic', true)
        },
        sinon.match.any
      )
      sinon.assert.calledWith(console.log, 'Public: yes')
    })

    it('should return 0 when JWT is missing', async () => {
      sandbox.stub(console, 'log')
      const post = sandbox.stub(uut.axios, 'post').resolves({ data: {} })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u', projects: [] },
        projects: []
      })

      const result = await uut.run({ name: 'x' })

      assert.equal(result, 0)
      sinon.assert.notCalled(post)
    })

    it('should return 0 when success is false', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: false,
          user: { _id: 'id', nftSharedCollections: [makeCreated()] }
        }
      })

      const result = await uut.run({ name: 'x' })

      assert.equal(result, 0)
    })

    it('should return 0 when nftSharedCollections missing', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          user: successUser('merged-id', [])
        }
      })

      const result = await uut.run({ name: 'x' })

      assert.equal(result, 0)
    })

    it('should return 0 on axios error and print response JSON', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').rejects(mockAxiosUnauthorizedError)

      const result = await uut.run({ name: 'x' })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'Unauthorized' }, null, 2)
      )
    })

    it('should return 0 and log generic wrapper when error has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)

      sandbox.stub(uut.axios, 'post').rejects(new Error(''))

      const result = await uut.run({ name: 'x' })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in create-sharable-collection/run(): ',
        sinon.match.instanceOf(Error)
      )
    })
  })
})
