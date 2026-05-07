/*
  Unit tests for create-collection.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import { mockAxiosUnauthorizedError } from '../mocks/api-mocks.js'
import { mockSessionCheckBalance } from '../mocks/session-mocks.js'

import CreateCollection from '../../../src/commands/create-collection.js'

const uut = new CreateCollection()

describe('#create-collection.js', () => {
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

    it('should throw when tokens-type is not an integer', () => {
      assert.throws(
        () => uut.validateFlags({ name: 'c1', tokensType: '1.5' }),
        /tokens-type/
      )
    })

    it('should throw when tokens-type is not 1 or 65', () => {
      assert.throws(
        () => uut.validateFlags({ name: 'c1', tokensType: '0' }),
        /tokens-type.*1 or 65/
      )
      assert.throws(
        () => uut.validateFlags({ name: 'c1', tokensType: '2' }),
        /tokens-type.*1 or 65/
      )
    })

    it('should accept tokens-type 65', () => {
      assert.equal(uut.validateFlags({ name: 'c', tokensType: '65' }), true)
    })

    it('should accept tokens-type 1', () => {
      assert.equal(uut.validateFlags({ name: 'c', tokensType: '1' }), true)
    })

    it('should accept tokens-type as a number flag', () => {
      assert.equal(uut.validateFlags({ name: 'c', tokensType: 1 }), true)
    })

    it('should accept name without tokens-type', () => {
      assert.equal(uut.validateFlags({ name: 'My Collection' }), true)
    })
  })

  describe('#run', () => {
    it('should POST /projects/ with project body and Bearer JWT', async () => {
      sandbox.stub(console, 'log')
      const session = {
        ...mockSessionCheckBalance,
        projects: [],
        user: {
          ...mockSessionCheckBalance.user,
          projects: []
        }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      const save = sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'new-col-id', projectLabel: 'NFT set' }
        }
      })

      const result = await uut.run({ name: 'NFT set', tokensType: '1' })

      assert.equal(result, true)
      sinon.assert.calledWith(
        uut.axios.post,
        sinon.match(/\/projects\/$/),
        {
          project: {
            schemaVersion: 1,
            projectLabel: 'NFT set',
            tokensType: 1
          }
        },
        sinon.match({
          headers: sinon.match.has('Authorization', 'Bearer test-jwt')
        })
      )
      sinon.assert.calledOnce(save)
      assert.include(session.projects, 'new-col-id')
      assert.include(session.user.projects, 'new-col-id')
    })

    it('should omit tokensType when tokens-type flag not passed', async () => {
      sandbox.stub(console, 'log')
      const session = {
        JWT: 'j',
        projects: [],
        user: { _id: 'u1', projects: [] }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'p2', projectLabel: 'Simple' }
        }
      })

      await uut.run({ name: 'Simple' })

      sinon.assert.calledWith(
        uut.axios.post,
        sinon.match.any,
        { project: { schemaVersion: 1, projectLabel: 'Simple' } },
        sinon.match.any
      )
    })

    it('should treat whitespace-only tokens-type as omitted in POST body', async () => {
      sandbox.stub(console, 'log')
      const session = {
        JWT: 'j',
        projects: [],
        user: { _id: 'u1', projects: [] }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'p-ws', projectLabel: 'Lbl' }
        }
      })

      await uut.run({ name: 'Lbl', tokensType: '   ' })

      sinon.assert.calledWith(
        uut.axios.post,
        sinon.match.any,
        { project: { schemaVersion: 1, projectLabel: 'Lbl' } },
        sinon.match.any
      )
    })

    it('should fall back to request label when API projectLabel blank and persist without session.user', async () => {
      sandbox.stub(console, 'log')
      const session = {
        JWT: 'jwt',
        projects: []
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      const save = sandbox.stub(uut.appUtils, 'saveUserData').resolves()

      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'pid-z', projectLabel: '   ' }
        }
      })

      const result = await uut.run({ name: 'Requested Title' })

      assert.equal(result, true)
      sinon.assert.calledWith(save, 'user.json', sinon.match({ projects: ['pid-z'] }))
      assert.isUndefined(session.user)
      sinon.assert.calledWith(console.log, sinon.match(/Label: Requested Title/))
    })

    it('should initialize top-level session.projects when absent', async () => {
      sandbox.stub(console, 'log')
      const session = {
        JWT: 'j',
        user: { _id: 'u1', projects: [] }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'p-top', projectLabel: 'L' }
        }
      })

      await uut.run({ name: 'L' })

      assert.deepEqual(session.projects, ['p-top'])
    })

    it('should initialize session.user.projects when user has no projects array', async () => {
      sandbox.stub(console, 'log')
      const session = {
        JWT: 'j',
        projects: [],
        user: { _id: 'u1' }
      }
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(session)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'p-new', projectLabel: 'Ok' }
        }
      })

      await uut.run({ name: 'Ok' })

      assert.deepEqual(session.user.projects, ['p-new'])
    })

    it('should return 0 when session has no JWT', async () => {
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

    it('should return 0 when POST response is not successful', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(mockSessionCheckBalance)
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: { success: false }
      })

      const result = await uut.run({ name: 'bad' })

      assert.equal(result, 0)
    })

    it('should return 0 on axios error and print JSON body when present', async () => {
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
        'Error in create-collection/run(): ',
        sinon.match.instanceOf(Error)
      )
    })
  })
})
