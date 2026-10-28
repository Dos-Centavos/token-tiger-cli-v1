/*
  Unit tests for create-token.js (create-token command).
*/

import { assert } from 'chai'
import sinon from 'sinon'

import CreateToken, {
  pickLastCollection,
  resolveProjectOwnerId
} from '../../../src/commands/create-token.js'

const uut = new CreateToken()

const baseFlags = {
  name: 'My NFT',
  file: '/tmp/create-token-main.png',
  thumbnail: '/tmp/create-token-thumb.png',
  url: '',
  description: '',
  nsfw: false,
  skipGallery: true,
  public: false
}

function sessionWithUser (overrides = {}) {
  return {
    JWT: 'test-jwt',
    user: {
      _id: 'user-1',
      email: 'owner@example.com',
      projects: ['proj-a'],
      ...overrides.user
    },
    projects: ['proj-a'],
    ...overrides
  }
}

describe('#create-token.js', () => {
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
        () => uut.validateFlags({ ...baseFlags, name: '' }),
        /name/
      )
    })

    it('should throw when main file is missing on disk', () => {
      sandbox.stub(uut.fs, 'existsSync').callsFake((p) => p !== '/missing.png')
      assert.throws(
        () => uut.validateFlags({ ...baseFlags, file: '/missing.png' }),
        /Main asset file not found/
      )
    })

    it('should throw when thumbnail is missing on disk', () => {
      sandbox.stub(uut.fs, 'existsSync').callsFake((p) => p !== '/bad-thumb.png')
      assert.throws(
        () => uut.validateFlags({ ...baseFlags, thumbnail: '/bad-thumb.png' }),
        /Thumbnail file not found/
      )
    })

    it('should return true when paths exist', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      assert.equal(uut.validateFlags(baseFlags), true)
    })

    it('should name a missing main file when the path is omitted', () => {
      assert.throws(
        () => uut.validateFlags({ ...baseFlags, file: '' }),
        /Main asset file not found: \(missing\)/
      )
    })

    it('should name a missing thumbnail when the path is omitted', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      assert.throws(
        () => uut.validateFlags({ ...baseFlags, thumbnail: '' }),
        /Thumbnail file not found: \(missing\)/
      )
    })
  })

  describe('#buildMetadataModel', () => {
    it('should set isThumbnail and omit isPubliclyAvailable for thumbnail metadata', () => {
      const m = uut.buildMetadataModel({
        title: 'thumbnail-x',
        projectId: 'p1',
        filePath: '/a/b/file.png',
        userId: 'u1',
        email: 'e@e.com',
        isThumbnail: true,
        isPubliclyAvailable: undefined,
        filePreview: ''
      })
      assert.equal(m.isThumbnail, true)
      assert.equal('isPubliclyAvailable' in m, false)
      assert.deepEqual(m.meta.fileData, ['png'])
    })

    it('should set isPubliclyAvailable on main asset metadata', () => {
      const m = uut.buildMetadataModel({
        title: 'Main',
        projectId: 'p1',
        filePath: '/x.pdf',
        userId: 'u1',
        email: 'e@e.com',
        isThumbnail: false,
        isPubliclyAvailable: true,
        filePreview: 'cid-1'
      })
      assert.equal(m.isPubliclyAvailable, true)
      assert.equal(m.meta.filePreview, 'cid-1')
    })

    it('should use unknow when the asset path has no extension', () => {
      const m = uut.buildMetadataModel({
        title: 'Main',
        projectId: 'p1',
        filePath: '/tmp/noext',
        userId: 'u1',
        email: 'e@e.com',
        isThumbnail: false,
        isPubliclyAvailable: false,
        filePreview: ''
      })
      assert.deepEqual(m.meta.fileData, ['unknow'])
    })

    it('should set isPubliclyAvailable false for main when flag is false', () => {
      const m = uut.buildMetadataModel({
        title: 'Main',
        projectId: 'p1',
        filePath: '/x.gif',
        userId: 'u1',
        email: 'e@e.com',
        isThumbnail: false,
        isPubliclyAvailable: false,
        filePreview: ''
      })
      assert.equal(m.isPubliclyAvailable, false)
    })
  })

  describe('#fetchUserProjects', () => {
    it('should GET /projects/ and return projects array', async () => {
      const projects = [{ _id: '1', tokensType: 1 }]
      sandbox.stub(uut.axios, 'get').resolves({ data: { projects } })

      const result = await uut.fetchUserProjects('http://localhost:5001', 'jwt')

      assert.deepEqual(result, projects)
      sinon.assert.calledWith(
        uut.axios.get,
        'http://localhost:5001/projects/',
        sinon.match({
          headers: sinon.match.has('Authorization', 'Bearer jwt')
        })
      )
    })

    it('should return empty array when response has no projects', async () => {
      sandbox.stub(uut.axios, 'get').resolves({ data: {} })

      const result = await uut.fetchUserProjects('http://x', 'j')

      assert.deepEqual(result, [])
    })
  })

  describe('#resolveCollectionId', () => {
    it('should return explicit collection when owner matches user', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        {
          _id: 'p1',
          tokensType: 1,
          projectLabel: 'Mine',
          owner: 'user-1'
        }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://localhost:5001',
        jwt: 'j',
        flags: { collection: 'p1' },
        session: sessionWithUser(),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.deepEqual(r, { projectId: 'p1', projectLabel: 'Mine' })
    })

    it('should accept explicit collection when no owner field but id is in session', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'proj-a', tokensType: 1, projectLabel: 'Shared' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: { collection: 'proj-a' },
        session: sessionWithUser(),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.deepEqual(r, { projectId: 'proj-a', projectLabel: 'Shared' })
    })

    it('should throw when explicit collection is not found', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: { collection: 'missing' },
          session: sessionWithUser(),
          user: { _id: 'user-1', email: 'a@b.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'not found')
      }
    })

    it('should throw when explicit collection owner differs from user', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'p1', tokensType: 1, owner: 'other-user' }
      ])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: { collection: 'p1' },
          session: sessionWithUser(),
          user: { _id: 'user-1', email: 'a@b.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'not owned')
      }
    })

    it('should throw when explicit collection has no owner and is not in session', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'p9', tokensType: 1, projectLabel: 'X' }
      ])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: { collection: 'p9' },
          session: { JWT: 'j', user: { _id: 'user-1', projects: [] }, projects: [] },
          user: { _id: 'user-1', email: 'a@b.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'not in your account')
      }
    })

    it('should pick last NFT collection by createdAt when none provided', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        {
          _id: 'old',
          tokensType: 1,
          projectLabel: 'Old',
          owner: 'user-1',
          createdAt: '2020-01-01T00:00:00.000Z'
        },
        {
          _id: 'new',
          tokensType: 1,
          projectLabel: 'New',
          owner: 'user-1',
          createdAt: '2024-06-01T00:00:00.000Z'
        }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({ projects: ['old', 'new'], user: { _id: 'user-1', email: 'a@b.com', projects: ['old', 'new'] } }),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'new')
      assert.equal(r.projectLabel, 'New')
    })

    it('should create new collection when user has no NFT collections', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: {
            _id: 'new-proj',
            projectLabel: 'owner'
          }
        }
      })

      const session = sessionWithUser({
        projects: [],
        user: { _id: 'user-1', email: 'owner@example.com', projects: [] }
      })

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session,
        user: session.user
      })

      assert.equal(r.projectId, 'new-proj')
      assert.equal(r.projectLabel, 'owner')
      sinon.assert.calledWith(
        uut.axios.post,
        'http://x/projects/',
        sinon.match({
          project: sinon.match({
            projectLabel: 'owner',
            tokensType: 1,
            schemaVersion: 1
          })
        }),
        sinon.match.object
      )
    })

    it('should pick last NFT collection by API order when createdAt is absent', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'first', tokensType: 1, projectLabel: 'A', owner: 'user-1' },
        { _id: 'second', tokensType: 1, projectLabel: 'B', owner: 'user-1' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: ['first', 'second'],
          user: { _id: 'user-1', email: 'a@b.com', projects: ['first', 'second'] }
        }),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'second')
      assert.equal(r.projectLabel, 'B')
    })

    it('should ignore non-NFT projects when auto-selecting collection', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'fungible', tokensType: 2, owner: 'user-1' },
        { _id: 'nft-only', tokensType: 1, projectLabel: 'N', owner: 'user-1' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: ['fungible', 'nft-only'],
          user: { _id: 'user-1', email: 'a@b.com', projects: ['fungible', 'nft-only'] }
        }),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'nft-only')
    })

    it('should throw when POST /projects/ does not return success', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])
      sandbox.stub(uut.axios, 'post').resolves({ data: { success: false } })

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: {},
          session: sessionWithUser({
            projects: [],
            user: { _id: 'user-1', email: 'x@y.com', projects: [] }
          }),
          user: { _id: 'user-1', email: 'x@y.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'Failed to create default collection')
      }
    })

    it('should use email username as label when API returns empty projectLabel', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'p-new', projectLabel: '' }
        }
      })

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: [],
          user: { id: 'user-1', email: 'alpha@beta.com', projects: [] }
        }),
        user: { id: 'user-1', email: 'alpha@beta.com' }
      })

      assert.equal(r.projectLabel, 'alpha')
    })

    it('should match owner using user.id when _id is absent', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'p1', tokensType: 1, projectLabel: 'L', owner: 'uid-99' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: { collection: 'p1' },
        session: sessionWithUser({ projects: ['p1'], user: { id: 'uid-99', email: 'a@b.com', projects: ['p1'] } }),
        user: { id: 'uid-99', email: 'a@b.com' }
      })

      assert.deepEqual(r, { projectId: 'p1', projectLabel: 'L' })
    })

    it('should throw when no collections and user has no email', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: {},
          session: {
            JWT: 'j',
            user: { _id: 'user-1', projects: [] },
            projects: []
          },
          user: { _id: 'user-1' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'no email')
      }
    })

    it('should select NFT collection by session membership when project has no owner field', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'mem-only', tokensType: 1, projectLabel: 'Member' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: ['mem-only'],
          user: { _id: 'user-1', email: 'a@b.com', projects: ['mem-only'] }
        }),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'mem-only')
    })

    it('should break ties by _id when createdAt matches', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        {
          _id: 'zzz',
          tokensType: 1,
          projectLabel: 'Z',
          owner: 'user-1',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        {
          _id: 'aaa',
          tokensType: 1,
          projectLabel: 'A',
          owner: 'user-1',
          createdAt: '2024-01-01T00:00:00.000Z'
        }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: ['zzz', 'aaa'],
          user: { _id: 'user-1', email: 'a@b.com', projects: ['zzz', 'aaa'] }
        }),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'zzz')
    })

    it('should throw when email local part is empty for new collection', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: {},
          session: sessionWithUser({
            projects: [],
            user: { _id: 'user-1', email: '@only-domain.com', projects: [] }
          }),
          user: { _id: 'user-1', email: '@only-domain.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'Could not derive a username')
      }
    })

    it('should init user.projects array when creating collection', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'brand-new', projectLabel: 'u' }
        }
      })

      const session = {
        JWT: 'j',
        projects: [],
        user: { _id: 'user-1', email: 'u@example.com' }
      }

      await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session,
        user: session.user
      })

      assert(Array.isArray(session.user.projects))
      assert.include(session.user.projects, 'brand-new')
    })

    it('should return null for an empty pick or a missing project', () => {
      assert.equal(pickLastCollection([]), null)
      assert.equal(resolveProjectOwnerId(null), null)
      assert.equal(resolveProjectOwnerId(undefined), null)
    })

    it('should resolve owner from a string, a number, and nested user ids', async () => {
      const fetch = sandbox.stub(uut, 'fetchUserProjects')
      fetch.onCall(0).resolves([{ _id: 'p-num', user: 42 }])
      fetch.onCall(1).resolves([{ _id: 'p-str', user: 'user-1' }])
      fetch.onCall(2).resolves([{ _id: 'p-oid', user: { _id: 'user-1' } }])
      fetch.onCall(3).resolves([{ _id: 'p-id', user: { id: 'user-1' } }])

      const base = {
        base: 'http://x',
        jwt: 'j',
        session: sessionWithUser(),
        user: { _id: 'user-1', email: 'a@b.com' }
      }
      const numeric = await uut.resolveCollectionId({
        ...base,
        flags: { collection: 'p-num' },
        user: { _id: '42', email: 'a@b.com' }
      })
      const asString = await uut.resolveCollectionId({
        ...base,
        flags: { collection: 'p-str' }
      })
      const nestedId = await uut.resolveCollectionId({
        ...base,
        flags: { collection: 'p-oid' }
      })
      const nestedAlt = await uut.resolveCollectionId({
        ...base,
        flags: { collection: 'p-id' }
      })

      assert.equal(numeric.projectId, 'p-num')
      assert.equal(numeric.projectLabel, 'p-num')
      assert.equal(asString.projectLabel, 'p-str')
      assert.equal(nestedId.projectLabel, 'p-oid')
      assert.equal(nestedAlt.projectLabel, 'p-id')
    })

    it('should throw when the projects payload is not an array', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves(null)

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: { collection: 'missing' },
          session: sessionWithUser(),
          user: { _id: 'user-1', email: 'a@b.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'not found')
      }
    })

    it('should create a collection when the projects payload is not a list', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves({ not: 'a list' })
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'from-bad-list', projectLabel: 'owner' }
        }
      })

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser({
          projects: [],
          user: { _id: 'user-1', email: 'owner@example.com', projects: [] }
        }),
        user: { _id: 'user-1', email: 'owner@example.com' }
      })

      assert.equal(r.projectId, 'from-bad-list')
    })

    it('should treat a missing user id as no owner match', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'p', tokensType: 1, owner: 'someone', projectLabel: 'X' }
      ])
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      const post = sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'created', projectLabel: 'plainuser' }
        }
      })

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: { JWT: 'j', projects: [], user: { email: 'plainuser' } },
        user: { email: 'plainuser' }
      })

      assert.equal(r.projectId, 'created')
      assert.equal(post.firstCall.args[1].project.projectLabel, 'plainuser')
    })

    it('should sort undated collections as older than a dated one', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'bare-a', tokensType: 1, projectLabel: 'A', owner: 'user-1' },
        {
          _id: 'dated',
          tokensType: 1,
          projectLabel: 'D',
          owner: 'user-1',
          createdAt: '2024-01-01T00:00:00.000Z'
        },
        { _id: 'bare-b', tokensType: 1, projectLabel: 'B', owner: 'user-1' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser(),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectId, 'dated')
    })

    it('should name an unowned collection by id when it has no label', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'p9', tokensType: 1 }
      ])

      try {
        await uut.resolveCollectionId({
          base: 'http://x',
          jwt: 'j',
          flags: { collection: 'p9' },
          session: { JWT: 'j', user: { _id: 'user-1', projects: [] }, projects: [] },
          user: { _id: 'user-1', email: 'a@b.com' }
        })
        assert.fail('expected throw')
      } catch (e) {
        assert.include(e.message, 'p9')
        assert.include(e.message, 'not in your account')
      }
    })

    it('should use the collection id when the last NFT has no label', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([
        { _id: 'nft-id', tokensType: 1, owner: 'user-1' }
      ])

      const r = await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session: sessionWithUser(),
        user: { _id: 'user-1', email: 'a@b.com' }
      })

      assert.equal(r.projectLabel, 'nft-id')
    })

    it('should initialize session.projects when it is missing', async () => {
      sandbox.stub(uut, 'fetchUserProjects').resolves([])
      sandbox.stub(uut.appUtils, 'saveUserData').resolves()
      sandbox.stub(uut.axios, 'post').resolves({
        data: {
          success: true,
          project: { _id: 'brand-new', projectLabel: 'u' }
        }
      })

      const session = {
        JWT: 'j',
        user: { _id: 'user-1', email: 'u@example.com', projects: ['keep'] }
      }

      await uut.resolveCollectionId({
        base: 'http://x',
        jwt: 'j',
        flags: {},
        session,
        user: session.user
      })

      assert.deepEqual(session.projects, ['brand-new'])
    })
  })

  describe('#tusUpload', () => {
    it('should resolve basename on Tus onSuccess', async () => {
      sandbox.stub(uut.fs, 'statSync').returns({ size: 42 })
      sandbox.stub(uut.fs, 'createReadStream').returns({ path: '/tmp/x.png' })
      sandbox.stub(uut, 'TusUpload').callsFake(function (stream, opts) {
        return {
          start () {
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })

      const name = await uut.tusUpload({
        filePath: '/tmp/x.png',
        endpoint: 'http://e/files',
        jwt: 'j'
      })

      assert.equal(name, 'x.png')
      sinon.assert.calledOnce(uut.TusUpload)
    })

    it('should default the content type for an unknown extension', async () => {
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.fs, 'createReadStream').returns({})
      let filetype
      sandbox.stub(uut, 'TusUpload').callsFake(function (stream, opts) {
        filetype = opts.metadata.filetype
        return {
          start () {
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })

      await uut.tusUpload({
        filePath: '/tmp/asset.bin',
        endpoint: 'http://e/files',
        jwt: 'j'
      })

      assert.equal(filetype, 'application/octet-stream')
    })

    it('should reject when Tus onError fires', async () => {
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.fs, 'createReadStream').returns({})
      sandbox.stub(uut, 'TusUpload').callsFake(function (stream, opts) {
        return {
          start () {
            queueMicrotask(() => opts.onError(new Error('tus failed')))
          }
        }
      })

      try {
        await uut.tusUpload({
          filePath: '/a/z.png',
          endpoint: 'http://e/files',
          jwt: 'j'
        })
        assert.fail('expected reject')
      } catch (e) {
        assert.include(e.message, 'tus failed')
      }
    })

    it('should log onProgress when upload completes', async () => {
      sandbox.stub(uut.fs, 'statSync').returns({ size: 100 })
      sandbox.stub(uut.fs, 'createReadStream').returns({})
      const log = sandbox.stub(console, 'log')
      sandbox.stub(uut, 'TusUpload').callsFake(function (stream, opts) {
        return {
          start () {
            opts.onProgress(100, 100)
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })

      await uut.tusUpload({
        filePath: '/q.png',
        endpoint: 'http://e/files',
        jwt: 'j',
        label: 'main asset'
      })

      sinon.assert.calledWith(
        log,
        sinon.match(/Tus main asset: upload complete \(100\/100 bytes\)/)
      )
    })
  })

  describe('#newMacroPayload', () => {
    it('should POST /macro/metadata/ and return data', async () => {
      sandbox.stub(uut.axios, 'post').resolves({ data: { success: true, metadataId: 'm1' } })

      const data = await uut.newMacroPayload('http://api', 'jwt', {
        metadata: {},
        encryptionFileName: 'f.png',
        ignoreEncryption: true
      })

      assert.deepEqual(data, { success: true, metadataId: 'm1' })
      sinon.assert.calledWith(
        uut.axios.post,
        'http://api/macro/metadata/',
        sinon.match.object,
        sinon.match.hasNested('headers.Accept', 'application/json')
      )
    })
  })

  describe('#tokenizePayload', () => {
    it('should POST body without address when address omitted', async () => {
      const post = sandbox.stub(uut.axios, 'post').resolves({ data: { success: true, txid: 't1' } })

      await uut.tokenizePayload('http://api', 'jwt', {
        payloadId: 'pid',
        customData: { ticker: 'NFT' },
        isNFT: true
      })

      sinon.assert.calledWith(
        post,
        'http://api/token/tokenize-payload/',
        sinon.match((body) => body.payloadId === 'pid' && body.isNFT === true && !('address' in body)),
        sinon.match.object
      )
    })

    it('should include address in body when provided', async () => {
      sandbox.stub(uut.axios, 'post').resolves({ data: {} })

      await uut.tokenizePayload('http://api', 'jwt', {
        payloadId: 'p',
        customData: {},
        address: 'addr1',
        isNFT: true
      })

      sinon.assert.calledWith(
        uut.axios.post,
        sinon.match.string,
        sinon.match.has('address', 'addr1'),
        sinon.match.object
      )
    })
  })

  describe('#addTokenToInboxGallery', () => {
    it('should POST gallery payload with inbox id from config', async () => {
      const prev = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = 'inbox-1'
      sandbox.stub(uut.axios, 'post').resolves({ data: {} })
      try {
        await uut.addTokenToInboxGallery('http://api', 'jwt', 'token-99')
        sinon.assert.calledWith(
          uut.axios.post,
          'http://api/gallery/nft/add',
          sinon.match({
            tokenData: { galleryId: 'inbox-1', tokenId: 'token-99' }
          }),
          sinon.match.object
        )
      } finally {
        uut.config.inboxGalleryId = prev
      }
    })
  })

  describe('#run', () => {
    it('should return true when pipeline succeeds', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 100 })

      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())

      sandbox.stub(uut, 'resolveCollectionId').resolves({
        projectId: 'p1',
        projectLabel: 'L'
      })
      sandbox.stub(uut, 'tusUpload')
        .onFirstCall().resolves('main.bin')
        .onSecondCall().resolves('thumb.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'm-thumb' })
        .onSecondCall().resolves({ success: true, metadataId: 'm-main' })
      sandbox.stub(uut, 'tokenizePayload').resolves({
        success: true,
        txid: 'tx-1'
      })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({ ...baseFlags })
        assert.equal(result, true)
        sinon.assert.calledTwice(uut.tusUpload)
        sinon.assert.calledWith(uut.tokenizePayload, sinon.match.string, sinon.match.string, sinon.match.has('payloadId', 'm-main'))
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should call addTokenToInboxGallery when inbox id is set and skipGallery false', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p1', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'a' })
        .onSecondCall().resolves({ success: true, metadataId: 'b' })
      sandbox.stub(uut, 'tokenizePayload').resolves({ success: true, txid: 'tx' })
      const gallery = sandbox.stub(uut, 'addTokenToInboxGallery').resolves()

      const prev = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = 'gallery-inbox'
      try {
        await uut.run({ ...baseFlags, skipGallery: false })
        sinon.assert.calledOnce(gallery)
      } finally {
        uut.config.inboxGalleryId = prev
      }
    })

    it('should return 0 when session has no JWT', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: '',
        user: { _id: 'u1', email: 'a@b.com' },
        projects: []
      })

      const result = await uut.run({ ...baseFlags })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, 'No JWT in session. Run login first.')
    })

    it('should return 0 when validateFlags fails', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(false)

      const result = await uut.run({ ...baseFlags })

      assert.equal(result, 0)
      sinon.assert.calledWith(console.log, sinon.match(/Main asset file not found/))
    })

    it('should print response JSON on axios-style error', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').rejects({
        response: { data: { err: 'bad' } }
      })

      const result = await uut.run({ ...baseFlags })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        JSON.stringify({ err: 'bad' }, null, 2)
      )
    })

    it('should return 0 when user has no id', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'j',
        user: { email: 'a@b.com' },
        projects: []
      })

      const result = await uut.run({ ...baseFlags })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'No user id in session. Run login again.'
      )
    })

    it('should return 0 when thumbnail metadata fails', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload').resolves({ success: false })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({ ...baseFlags })
        assert.equal(result, 0)
        sinon.assert.calledWith(console.log, 'Thumbnail metadata creation failed.')
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should return 0 when main asset metadata fails', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 't' })
        .onSecondCall().resolves({ success: false })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({ ...baseFlags })
        assert.equal(result, 0)
        sinon.assert.calledWith(console.log, 'Asset metadata creation failed.')
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should return 0 when tokenize returns no txid', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'a' })
        .onSecondCall().resolves({ success: true, metadataId: 'b' })
      sandbox.stub(uut, 'tokenizePayload').resolves({ success: true })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({ ...baseFlags })
        assert.equal(result, 0)
        sinon.assert.calledWith(console.log, 'Token creation failed.')
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should log generic error when thrown value has no message', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').rejects(Object.create(null))

      const result = await uut.run({ ...baseFlags })

      assert.equal(result, 0)
      sinon.assert.calledWith(
        console.log,
        'Error in create-token/run(): ',
        sinon.match.any
      )
    })

    it('should log skip-gallery message when skipGallery is true', async () => {
      const log = sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'a' })
        .onSecondCall().resolves({ success: true, metadataId: 'b' })
      sandbox.stub(uut, 'tokenizePayload').resolves({ success: true, txid: 'tx' })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        await uut.run({ ...baseFlags, skipGallery: true })
        sinon.assert.calledWith(
          log,
          sinon.match(/Skipping inbox gallery \(--skip-gallery\)/)
        )
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should run full pipeline with real tusUpload stub and real newMacroPayload stubs', async () => {
      sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 5 })
      sandbox.stub(uut.fs, 'createReadStream').returns({ path: '/tmp/x.png' })
      sandbox.stub(uut, 'TusUpload').callsFake(function (stream, opts) {
        return {
          start () {
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves(sessionWithUser())
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'm1' })
        .onSecondCall().resolves({ success: true, metadataId: 'm2' })
      sandbox.stub(uut, 'tokenizePayload').resolves({ success: true, txid: 'txid-full' })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({ ...baseFlags })
        assert.equal(result, true)
        sinon.assert.calledTwice(uut.TusUpload)
        sinon.assert.calledTwice(uut.newMacroPayload)
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })

    it('should skip the inbox gallery when no gallery id is configured', async () => {
      const log = sandbox.stub(console, 'log')
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.appUtils, 'getSessionInfo').resolves({
        JWT: 'test-jwt',
        user: { id: 'user-1', email: 'owner@example.com' },
        projects: ['proj-a']
      })
      sandbox.stub(uut, 'resolveCollectionId').resolves({ projectId: 'p', projectLabel: 'L' })
      sandbox.stub(uut, 'tusUpload').resolves('f.bin')
      sandbox.stub(uut, 'newMacroPayload')
        .onFirstCall().resolves({ success: true, metadataId: 'a' })
        .onSecondCall().resolves({ success: true, metadataId: 'b' })
      const tokenize = sandbox.stub(uut, 'tokenizePayload').resolves({ success: true, txid: 'tx' })

      const inbox = uut.config.inboxGalleryId
      uut.config.inboxGalleryId = ''
      try {
        const result = await uut.run({
          ...baseFlags,
          url: null,
          description: null,
          skipGallery: false
        })
        assert.equal(result, true)
        sinon.assert.calledWith(
          log,
          sinon.match(/set TOKEN_TIGER_INBOX_GALLERY to enable/)
        )
        const customData = tokenize.firstCall.args[2].customData
        assert.equal(customData.issuerUrl, '')
        assert.equal(customData.about, '')
        assert.equal(customData.userData.currentUrl, '')
        assert.equal(customData.gallery, true)
      } finally {
        uut.config.inboxGalleryId = inbox
      }
    })
  })
})
