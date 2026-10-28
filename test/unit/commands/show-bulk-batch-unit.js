/*
  Unit tests for show-bulk-batch.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import ShowBulkBatch from '../../../src/commands/show-bulk-batch.js'

const uut = new ShowBulkBatch()

function sessionWithUser () {
  return {
    JWT: 'test-jwt',
    user: { _id: 'user-1', email: 'owner@example.com' },
    projects: []
  }
}

function batchWith (status) {
  return {
    success: true,
    batchId: 'b1',
    items: [{
      title: 'One',
      status,
      payloadId: status === 'completed' ? 'payload-1' : null,
      txid: status === 'completed' ? 'tx-1' : null,
      error: status === 'failed' ? 'boom' : null
    }]
  }
}

describe('#show-bulk-batch.js', () => {
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
      assert.throws(() => uut.validateFlags({}), /batch id/i)
    })

    it('should reject invalid interval and timeout values', () => {
      assert.throws(
        () => uut.validateFlags({ batch: 'b1', interval: '0' }),
        /interval/
      )
      assert.throws(
        () => uut.validateFlags({ batch: 'b1', interval: 'abc' }),
        /interval/
      )
      assert.throws(
        () => uut.validateFlags({ batch: 'b1', timeout: '-1' }),
        /timeout/
      )
    })
  })

  describe('#countStatuses and #isTerminal', () => {
    it('should count every status', () => {
      const counts = uut.countStatuses([
        { status: 'queued' },
        { status: 'queued' },
        { status: 'processing' },
        { status: 'completed' },
        { status: 'failed' },
        { status: 'unknown' }
      ])

      assert.deepEqual(counts, {
        queued: 2,
        processing: 1,
        completed: 1,
        failed: 1
      })
    })

    it('should treat completed and failed as terminal', () => {
      assert.equal(uut.isTerminal([{ status: 'completed' }, { status: 'failed' }]), true)
      assert.equal(uut.isTerminal([{ status: 'queued' }]), false)
      assert.equal(uut.isTerminal([]), true)
      assert.equal(uut.isTerminal(null), true)
    })

    it('should count nothing when items are missing', () => {
      assert.deepEqual(uut.countStatuses(null), {
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0
      })
    })
  })

  describe('#printBatch', () => {
    it('should render empty, sparse, and full rows', () => {
      uut.printBatch({ batchId: 'b', items: [] })
      uut.printBatch({ batchId: 'b' })
      uut.printBatch({
        batchId: 'b',
        items: [
          {
            title: 'One',
            status: 'queued',
            payloadId: 'p',
            txid: 't',
            error: 'e'
          },
          {}
        ]
      })

      const out = console.log.args.map((a) => a.join(' ')).join('\n')
      assert.include(out, 'One')
      assert.include(out, 'Batch b: 0 item')
    })
  })

  describe('#run', () => {
    it('should fetch and print a batch once', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      const get = sandbox.stub(uut.axios, 'get').resolves({ data: batchWith('queued') })
      const print = sandbox.stub(uut, 'printBatch')

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, true)
      assert.equal(
        get.firstCall.args[0],
        'http://localhost:5001/macro/payload/bulk/b1'
      )
      sinon.assert.calledOnce(print)
    })

    it('should poll until the batch is terminal', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      const fetch = sandbox.stub(uut, 'fetchBatch')
        .onFirstCall().resolves(batchWith('queued'))
        .onSecondCall().resolves(batchWith('completed'))
      sandbox.stub(uut.appUtils, 'sleep').resolves()
      const print = sandbox.stub(uut, 'printBatch')

      const result = await uut.run({
        batch: 'b1',
        watch: true,
        interval: '1',
        timeout: '0'
      })

      assert.equal(result, true)
      sinon.assert.calledTwice(fetch)
      sinon.assert.calledOnce(print)
    })

    it('should return 0 when watch mode times out', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'fetchBatch').resolves(batchWith('queued'))
      sandbox.stub(uut.appUtils, 'sleep').resolves()
      sandbox.stub(uut, 'now')
        .onFirstCall().returns(0)
        .onSecondCall().returns(2000)
      const print = sandbox.stub(uut, 'printBatch')

      const result = await uut.run({
        batch: 'b1',
        watch: true,
        interval: '1',
        timeout: '1'
      })

      assert.equal(result, 0)
      sinon.assert.calledOnce(print)
    })

    it('should return 0 when the session has no JWT', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({ user: { _id: 'u1' } })

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, 0)
    })

    it('should return 0 when the API request fails', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').rejects(new Error('not found'))

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, 0)
    })

    it('should return 0 when the batch payload is not usable', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').resolves({ data: { success: true, items: null } })

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, sinon.match(/Could not load the batch/))
    })

    it('should default the watch interval and timeout', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'fetchBatch').resolves(batchWith('completed'))

      const result = await uut.run({ batch: 'b1', watch: true })

      assert.equal(result, true)
    })

    it('should print the response body when the request errors', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').rejects({
        response: { data: { error: 'nope' } }
      })

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'nope' }, null, 2)
      )
    })

    it('should log a wrapper when the failure has no message', async () => {
      const bare = Object.create(null)
      sandbox.stub(uut.appUtils, 'getSessionInfo').rejects(bare)

      const result = await uut.run({ batch: 'b1' })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'Error in show-bulk-batch/run(): ', bare)
    })
  })
})
