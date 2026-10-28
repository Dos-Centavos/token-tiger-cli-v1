/*
  Unit tests for append-bulk-tokens.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import AppendBulkTokens from '../../../src/commands/append-bulk-tokens.js'

const uut = new AppendBulkTokens()

function sessionWithUser () {
  return {
    JWT: 'test-jwt',
    user: { _id: 'user-1', email: 'owner@example.com', projects: ['proj-a'] },
    projects: ['proj-a']
  }
}

function item (overrides = {}) {
  return {
    file: '/art/two.png',
    thumbnail: '/art/two-thumb.png',
    title: 'One',
    address: 'ignored',
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

describe('#append-bulk-tokens.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(console, 'log')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should require a batch id', () => {
      assert.throws(
        () => uut.validateFlags({ manifest: 'm.json' }),
        /batch id/i
      )
    })

    it('should require a manifest path', () => {
      assert.throws(
        () => uut.validateFlags({ batch: 'b1' }),
        /manifest path/i
      )
    })
  })

  describe('#run', () => {
    it('should upload files and append only file names and title', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      const get = sandbox.stub(uut.axios, 'get').resolves({
        data: { success: true, batchId: 'b1', items: [{ title: 'old' }] }
      })
      const upload = sandbox.stub(uut.uploader, 'upload')
        .onFirstCall().resolves('two.png')
        .onSecondCall().resolves('two-thumb.png')
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'b1', itemCount: 1, status: 'queued' }
      })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, true)
      assert.equal(
        get.firstCall.args[0],
        'http://localhost:5001/macro/payload/bulk/b1'
      )
      sinon.assert.calledTwice(upload)
      assert.equal(
        post.firstCall.args[0],
        'http://localhost:5001/macro/payload/bulk/b1/items'
      )
      assert.deepEqual(post.firstCall.args[1], {
        items: [{
          originalFileName: 'two.png',
          thumbnailFileName: 'two-thumb.png',
          title: 'One'
        }]
      })
    })

    it('should reject when the batch would exceed ten items', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.axios, 'get').resolves({
        data: {
          success: true,
          batchId: 'b1',
          items: Array.from({ length: 10 }, () => ({ status: 'completed' }))
        }
      })
      const upload = sandbox.stub(uut.uploader, 'upload')
      const post = sandbox.stub(uut.axios, 'post')

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.notCalled(upload)
      sinon.assert.notCalled(post)
    })

    it('should not upload or queue during a dry run', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.axios, 'get').resolves({
        data: { success: true, batchId: 'b1', items: [] }
      })
      const upload = sandbox.stub(uut.uploader, 'upload')
      const post = sandbox.stub(uut.axios, 'post')

      const result = await uut.run({
        batch: 'b1',
        manifest: 'batch.json',
        dryRun: true
      })

      assert.equal(result, true)
      sinon.assert.notCalled(upload)
      sinon.assert.notCalled(post)
    })

    it('should return 0 when the batch cannot be loaded', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.axios, 'get').resolves({ data: { success: false } })
      const upload = sandbox.stub(uut.uploader, 'upload')

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.notCalled(upload)
    })

    it('should return 0 when the session has no JWT', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u1' }
      })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
    })

    it('should return 0 when the append request fails', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.axios, 'get').resolves({
        data: { success: true, batchId: 'b1', items: [] }
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').resolves({ data: { success: false } })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
    })

    it('should treat a missing items list as empty and default the queue status', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut, 'fetchBatch').resolves({ items: null })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').resolves({
        data: { success: true, batchId: 'b1' }
      })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, true)
      sinon.assert.calledWith(console.log, sinon.match(/status: queued/))
    })

    it('should print blank plan cells when item fields are missing', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([{}])
      sandbox.stub(uut, 'fetchBatch').resolves({ items: [] })

      const result = await uut.run({
        batch: 'b1',
        manifest: 'batch.json',
        dryRun: true
      })

      assert.equal(result, true)
      sinon.assert.calledWith(console.log, sinon.match(/Batch would contain 1 item/))
    })

    it('should return 0 when the session has no user id', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'jwt',
        user: {}
      })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, sinon.match(/No user id/))
    })

    it('should print the response body when the append request errors', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.manifest, 'load').returns({ items: [{}] })
      sandbox.stub(uut.manifest, 'validate').returns([item()])
      sandbox.stub(uut.axios, 'get').resolves({
        data: { success: true, batchId: 'b1', items: [] }
      })
      sandbox.stub(uut.uploader, 'upload').resolves('f.png')
      sandbox.stub(uut.axios, 'post').rejects({
        response: { data: { error: 'nope' } }
      })

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'nope' }, null, 2)
      )
    })

    it('should log a wrapper when the failure has no message', async () => {
      const bare = Object.create(null)
      sandbox.stub(uut.appUtils, 'getSessionInfo').rejects(bare)

      const result = await uut.run({ batch: 'b1', manifest: 'batch.json' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'Error in append-bulk-tokens/run(): ', bare)
    })
  })
})
