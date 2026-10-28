/*
  Unit tests for src/lib/bulk-manifest.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import BulkManifest, { fileExtension, titleFromPath } from '../../../src/lib/bulk-manifest.js'

const uut = new BulkManifest()

function normalizedItem (overrides = {}) {
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

describe('#bulk-manifest.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#load', () => {
    it('should read and parse a manifest', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'readFileSync').returns('{"items":[]}')

      assert.deepEqual(uut.load('batch.json'), { items: [] })
    })

    it('should throw when the manifest path is missing', () => {
      assert.throws(() => uut.load(''), /manifest path/i)
    })

    it('should throw when the manifest does not exist', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(false)

      assert.throws(() => uut.load('/missing.json'), /Manifest not found/)
    })

    it('should throw when the manifest is not valid JSON', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'readFileSync').returns('{')

      assert.throws(() => uut.load('bad.json'), /Invalid JSON/)
    })
  })

  describe('#validate', () => {
    it('should reject a non-object manifest', () => {
      assert.throws(() => uut.validate(null), /JSON object/)
    })

    it('should reject a missing items array', () => {
      assert.throws(() => uut.validate({}), /items.*array/)
    })

    it('should reject an empty items array', () => {
      assert.throws(() => uut.validate({ items: [] }), /must not be empty/)
    })

    it('should reject more than ten items', () => {
      const items = Array.from({ length: 11 }, () => ({}))
      assert.throws(() => uut.validate({ items }), /more than 10/)
    })

    it('should reject a non-string collection', () => {
      assert.throws(
        () => uut.validate({ collection: 42, items: [{}] }),
        /collection.*string/
      )
    })

    it('should require item file and thumbnail strings', () => {
      assert.throws(() => uut.validate({ items: [{}] }), /file must be a string/)
      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png' }] }),
        /thumbnail must be a string/
      )
    })

    it('should require files to exist on disk', () => {
      sandbox.stub(uut.fs, 'existsSync').callsFake((p) => p !== '/missing.png')

      assert.throws(
        () => uut.validate({ items: [{ file: '/missing.png', thumbnail: '/t.png' }] }),
        /file not found/
      )
      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png', thumbnail: '/missing.png' }] }),
        /thumbnail not found/
      )
    })

    it('should default the title from the asset basename', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      const [item] = uut.validate({
        items: [{ file: '/art/my file.png', thumbnail: '/art/t.png' }]
      })

      assert.equal(item.title, 'my file')
      assert.deepEqual(item, normalizedItem({
        file: '/art/my file.png',
        thumbnail: '/art/t.png',
        title: 'my file'
      }))
    })

    it('should fall back to Untitled when a basename has no usable stem', () => {
      assert.equal(titleFromPath('/'), 'Untitled')
    })

    it('should accept destAddr as an alias for address', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      const [item] = uut.validate({
        items: [{ file: '/a.png', thumbnail: '/t.png', destAddr: 'addr-1' }]
      })

      assert.equal(item.address, 'addr-1')
    })

    it('should reject non-boolean flags and non-object overrides', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)

      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png', thumbnail: '/t.png', public: 'yes' }] }),
        /public must be a boolean/
      )
      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png', thumbnail: '/t.png', metadata: [] }] }),
        /metadata must be an object/
      )
      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png', thumbnail: '/t.png', customData: 'x' }] }),
        /customData must be an object/
      )
    })

    it('should accept explicit strings, booleans, and object overrides', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      const [item] = uut.validate({
        items: [{
          file: '/a.png',
          thumbnail: '/t.png',
          title: 'Named',
          address: 'addr',
          public: true,
          addToGallery: true,
          nsfw: false,
          url: 'https://u',
          description: 'd',
          metadata: { schemaVersion: 2 },
          customData: { ticker: 'Z' }
        }]
      })

      assert.equal(item.title, 'Named')
      assert.equal(item.address, 'addr')
      assert.equal(item.public, true)
      assert.equal(item.addToGallery, true)
      assert.deepEqual(item.metadata, { schemaVersion: 2 })
      assert.deepEqual(item.customData, { ticker: 'Z' })
    })

    it('should reject a non-string title and a non-object item', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      assert.throws(
        () => uut.validate({ items: [{ file: '/a.png', thumbnail: '/t.png', title: 1 }] }),
        /title must be a string/
      )
      assert.throws(
        () => uut.validate({ items: [null] }),
        /must be an object/
      )
    })

    it('should reject a blank title by using the file name', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      const [item] = uut.validate({
        items: [{ file: '/x.gif', thumbnail: '/t.png', title: '   ' }]
      })

      assert.equal(item.title, 'x')
    })
  })

  describe('#buildCreateItems', () => {
    it('should shape API items with metadata and custom data', () => {
      const items = [normalizedItem({
        address: 'addr-1',
        public: true,
        addToGallery: true,
        url: 'https://tokentiger.com',
        description: 'About',
        nsfw: true,
        metadata: { meta: { filePreview: 'thumb-id' } },
        customData: { ticker: 'CUSTOM' }
      })]

      const [out] = uut.buildCreateItems({
        items,
        projectId: 'proj-1',
        userId: 'user-1',
        email: 'user@example.com'
      })

      assert.equal(out.originalFileName, '/art/one.png')
      assert.equal(out.thumbnailFileName, '/art/one-thumb.png')
      assert.equal(out.projectId, 'proj-1')
      assert.equal(out.destAddr, 'addr-1')
      assert.equal(out.addToGallery, true)

      assert.equal(out.metadata.schemaVersion, 1)
      assert.equal(out.metadata.projectId, 'proj-1')
      assert.equal(out.metadata.owner, 'user-1')
      assert.equal(out.metadata.userIdUpload, 'user-1')
      assert.equal(out.metadata.isPubliclyAvailable, true)
      assert.deepEqual(out.metadata.meta.fileData, ['png'])
      assert.equal(out.metadata.meta.filePreview, 'thumb-id')
      assert.equal(out.metadata.meta.emailOwner, 'user@example.com')

      assert.equal(out.customData.issuerUrl, 'https://tokentiger.com')
      assert.equal(out.customData.about, 'About')
      assert.equal(out.customData.nsfw, true)
      assert.equal(out.customData.ticker, 'CUSTOM')
      assert.equal(out.customData.userData.currentUrl, 'https://tokentiger.com')
      assert.deepEqual(out.customData.userData.templateMetadata, {})
    })

    it('should use uploaded names when present', () => {
      const items = [normalizedItem({
        originalFileName: 'one.png',
        thumbnailFileName: 'one-thumb.png'
      })]

      const [out] = uut.buildCreateItems({
        items,
        projectId: 'p',
        userId: 'u'
      })

      assert.equal(out.originalFileName, 'one.png')
      assert.equal(out.thumbnailFileName, 'one-thumb.png')
    })

    it('should default metadata and merge custom userData', () => {
      const [bare, out] = uut.buildCreateItems({
        items: [
          { file: '/a.png', thumbnail: '/t.png', title: 'Bare' },
          {
            file: '/a.png',
            thumbnail: '/t.png',
            title: 'T',
            customData: { userData: { extra: 1 } }
          }
        ],
        projectId: 'p',
        userId: 'u'
      })
      assert.equal(bare.customData.ticker, 'NFT')
      assert.equal(bare.metadata.meta.emailOwner, '')

      assert.equal(out.metadata.meta.emailOwner, '')
      assert.equal(out.customData.userData.extra, 1)
      assert.deepEqual(out.customData.userData.templateMetadata, {})
    })

    it('should require items, projectId, and userId', () => {
      assert.throws(() => uut.buildCreateItems({}), /items must be an array/)
      assert.throws(
        () => uut.buildCreateItems({ items: [], userId: 'u' }),
        /projectId must be a string/
      )
      assert.throws(
        () => uut.buildCreateItems({ items: [], projectId: 'p' }),
        /userId must be a string/
      )
    })
  })

  describe('#buildAppendItems', () => {
    it('should return only file, thumbnail, and title', () => {
      const out = uut.buildAppendItems({
        items: [normalizedItem({ address: 'ignored', addToGallery: true })]
      })

      assert.deepEqual(out, [{
        file: '/art/one.png',
        thumbnail: '/art/one-thumb.png',
        title: 'One'
      }])
    })

    it('should require an items array', () => {
      assert.throws(() => uut.buildAppendItems({}), /items must be an array/)
    })
  })

  describe('#fileExtension', () => {
    it('should return the lower-case extension or unknow', () => {
      assert.equal(fileExtension('/a/B.PNG'), 'png')
      assert.equal(fileExtension('/a/no-extension'), 'unknow')
      assert.equal(fileExtension(), 'unknow')
      assert.equal(fileExtension(''), 'unknow')
      assert.equal(titleFromPath(), 'Untitled')
      assert.equal(titleFromPath(''), 'Untitled')
    })
  })
})
