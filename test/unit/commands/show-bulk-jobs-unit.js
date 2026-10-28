/*
  Unit tests for show-bulk-jobs.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import ShowBulkJobs from '../../../src/commands/show-bulk-jobs.js'

const uut = new ShowBulkJobs()

function sessionWithUser () {
  return {
    JWT: 'test-jwt',
    user: { _id: 'user-1', email: 'owner@example.com' },
    projects: []
  }
}

function jobsData () {
  return {
    success: true,
    items: [{
      batchId: 'b1',
      projectId: 'p1',
      title: 'One',
      status: 'queued',
      payloadId: null,
      txid: null,
      error: null
    }],
    batches: [{
      batchId: 'b1',
      projectId: 'p1',
      queued: 1,
      processing: 0,
      completed: 0,
      failed: 0,
      itemCount: 1
    }]
  }
}

describe('#show-bulk-jobs.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(console, 'log')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#validateFlags', () => {
    it('should reject an unknown status', () => {
      assert.throws(
        () => uut.validateFlags({ status: 'done' }),
        /status must be one of/
      )
    })

    it('should accept the four statuses', () => {
      for (const status of ['queued', 'processing', 'completed', 'failed']) {
        assert.equal(uut.validateFlags({ status }), true)
      }
    })

    it('should reject a non-string project id', () => {
      assert.throws(
        () => uut.validateFlags({ project: 1 }),
        /project must be a string/
      )
    })
  })

  describe('#run', () => {
    it('should fetch jobs for the session user with filters', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      const get = sandbox.stub(uut.axios, 'get').resolves({ data: jobsData() })

      const result = await uut.run({ status: 'queued', project: 'p1' })

      assert.equal(result, true)
      assert.equal(
        get.firstCall.args[0],
        'http://localhost:5001/macro/payload/bulk/user/user-1'
      )
      assert.deepEqual(get.firstCall.args[1].params, {
        status: 'queued',
        projectId: 'p1'
      })
    })

    it('should omit params when no filters are given', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      const get = sandbox.stub(uut.axios, 'get').resolves({ data: jobsData() })

      await uut.run({})

      assert.deepEqual(get.firstCall.args[1].params, {})
    })

    it('should handle empty items and batches', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').resolves({
        data: { success: true, items: [], batches: [] }
      })

      const result = await uut.run({})

      assert.equal(result, true)
    })

    it('should return 0 when the session has no JWT', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        user: { _id: 'u1' }
      })

      const result = await uut.run({})

      assert.equal(result, 0)
    })

    it('should return 0 when the session has no user id', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'jwt',
        user: {}
      })

      const result = await uut.run({})

      assert.equal(result, 0)
    })

    it('should return 0 when the API rejects the request', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').resolves({ data: { success: false } })

      const result = await uut.run({})

      assert.equal(result, 0)
    })

    it('should fill blank cells and ignore non-array payloads', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      const get = sandbox.stub(uut.axios, 'get')
      get.onFirstCall().resolves({
        data: { success: true, items: [{}], batches: [{}] }
      })

      assert.equal(await uut.run({}), true)

      get.onSecondCall().resolves({
        data: { success: true, items: null, batches: { bad: true } }
      })

      assert.equal(await uut.run({}), true)
    })

    it('should print the response body when the request errors', async () => {
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut.axios, 'get').rejects({
        response: { data: { error: 'nope' } }
      })

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ error: 'nope' }, null, 2)
      )
    })

    it('should log a wrapper when the failure has no message', async () => {
      const bare = Object.create(null)
      sandbox.stub(uut.appUtils, 'getSessionInfo').rejects(bare)

      const result = await uut.run({})

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'Error in show-bulk-jobs/run(): ', bare)
    })
  })
})
