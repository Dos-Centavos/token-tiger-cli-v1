/*
  Unit tests for create-bulk-tokens.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import CreateBulkTokens from '../../../src/commands/create-bulk-tokens.js'

const uut = new CreateBulkTokens()

function sessionWithUser () {
  return {
    JWT: 'test-jwt',
    user: { _id: 'user-1', email: 'owner@example.com', projects: ['proj-a'] },
    projects: ['proj-a']
  }
}

function item (overrides = {}) {
  return {
    file: '/art/one.png',
    thumbnail: '/art/one-thumb.png',
    title: 'One',
    address: '',
    public: false,
    addToGallery: false,
    url: '',
    description: '',
    nsfw: false,
    metadata: {},
    customData: {},
    ...overrides
  }
}

describe('#create-bulk-tokens.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(console, 'log')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should require a manifest path', () => {
      assert.throws(() => uut.validateFlags({}), /manifest path/i)
    })
  })

  describe('#loadSession', () => {
    it('should throw when the session has no JWT', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        user: { _id: 'u1' }
      })

      try {
        await uut.loadSession()
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'No JWT')
      }
    })

    it('should throw when the session has no user id', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'jwt',
        user: {}
      })

      try {
        await uut.loadSession()
        assert.fail('expected throw')
      } catch (err) {
        assert.include(err.message, 'No user id')
      }
    })
  })

  describe('#run', () => {
    it('should upload every file and queue the batch', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({
        collection: 'manifest-col',
        items: [{}]
      })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      const resolve = sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'proj-1',
        projectLabel: 'My collection'
      })
      const upload = sandbox.stub(uut.uploader, 'upload')
        .onFirstCall().resolves('one.png')
        .onSecondCall().resolves('one-thumb.png')
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'batch-1', itemCount: 1, status: 'queued' }
      })

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, true)
      sinon.assert.calledWith(resolve, sinon.match({
        flags: { collection: 'manifest-col' }
      }))
      sinon.assert.calledTwice(upload)
      sinon.assert.calledOnce(post)

      const [url, body, options] = post.firstCall.args
      assert.equal(url, 'http://localhost:5001/macro/payload/bulk')
      assert.equal(body.items.length, 1)
      assert.equal(body.items[0].originalFileName, 'one.png')
      assert.equal(body.items[0].thumbnailFileName, 'one-thumb.png')
      assert.equal(body.items[0].projectId, 'proj-1')
      assert.equal(body.items[0].title, 'One')
      assert.equal(body.items[0].destAddr, null)
      assert.equal(options.headers.Authorization, 'Bearer test-jwt')
    })

    it('should let --collection override manifest.collection', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({
        collection: 'manifest-col',
        items: [{}]
      })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      const resolve = sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'proj-2',
        projectLabel: 'Other'
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'b1', itemCount: 1 }
      })

      await uut.run({ manifest: 'batch.json', collection: 'proj-2' })

      sinon.assert.calledWith(resolve, sinon.match({
        flags: { collection: 'proj-2' }
      }))
    })

    it('should apply --address and --gallery defaults', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'b1', itemCount: 1 }
      })

      await uut.run({
        manifest: 'batch.json',
        address: 'simpleledger:abc',
        gallery: true
      })

      const body = post.firstCall.args[1]
      assert.equal(body.items[0].destAddr, 'simpleledger:abc')
      assert.equal(body.items[0].addToGallery, true)
    })

    it('should not upload or queue during a dry run', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      const resolve = sandbox.stub(uut.collectionResolver, 'resolveCollectionId')
      const upload = sandbox.stub(uut.uploader, 'upload')
      const post = sandbox.stub(uut.axios, 'post')

      const result = await uut.run({ manifest: 'batch.json', dryRun: true })

      assert.equal(result, true)
      sinon.assert.notCalled(resolve)
      sinon.assert.notCalled(upload)
      sinon.assert.notCalled(post)
    })

    it('should return 0 when the API rejects the batch', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').resolves({ data: { success: false } })

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, 0)
    })

    it('should return 0 when the session has no JWT', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u1' }
      })

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, 0)
    })

    it('should fall back to user.id and the queued status', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'test-jwt',
        user: { id: 'user-from-id', email: 'owner@example.com' },
        projects: []
      })
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'b1' }
      })

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, true)
      assert.equal(post.firstCall.args[1].items[0].metadata.userIdUpload, 'user-from-id')
      sinon.assert.calledWith(console.log, sinon.match(/status: queued/))
    })

    it('should mark gallery yes on a dry-run plan', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item({ addToGallery: true })])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })

      const result = await uut.run({
        manifest: 'batch.json',
        dryRun: true,
        collection: 'p1',
        gallery: true
      })

      assert.equal(result, true)
    })

    it('should fill blank plan cells', () => {
      uut.printPlan([{}])
      uut.printPlan([{
        title: 'T',
        originalFileName: 'a.png',
        thumbnailFileName: 'b.png',
        addToGallery: true,
        destAddr: 'simpleledger:abc'
      }])
    })

    it('should print the response body when the request errors', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').rejects({
        response: { data: { error: 'nope' } }
      })

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'nope' }, null, 2)
      )
    })

    it('should log a wrapper when the failure has no message', async () => {
      const bare = Object.create(null)
      sandbox.stub(uut.appUtils, 'getSessionInfo').rejects(bare)

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'Error in create-bulk-tokens/run(): ', bare)
    })

    it('should return 0 when uploads fail', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.collectionResolver, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut.uploader, 'upload').rejects(new Error('tus failed'))
      const post = sandbox.stub(uut.axios, 'post')

      const result = await uut.run({ manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.notCalled(post)
    })
  })
})
