/*
  Unit tests for src/lib/tus-upload.js.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import TusUploader, { guessFileType, normalizeUploadName } from '../../../src/lib/tus-upload.js'

const uut = new TusUploader()

describe('#tus-upload.js', () => {
  let sandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#normalizeUploadName', () => {
    it('should replace whitespace with hyphens', () => {
      assert.equal(normalizeUploadName('/art/my file.png'), 'my-file.png')
    })

    it('should fall back to upload for an unusable path', () => {
      assert.equal(normalizeUploadName(''), 'upload')
    })
  })

  describe('#guessFileType', () => {
    it('should map known extensions and default to octet-stream', () => {
      assert.equal(guessFileType('/a/x.PNG'), 'image/png')
      assert.equal(guessFileType('/a/x.unknown'), 'application/octet-stream')
    })
  })

  describe('#upload', () => {
    it('should throw when the file does not exist', () => {
      sandbox.stub(uut.fs, 'existsSync').returns(false)

      assert.throws(
        () => uut.upload({ filePath: '/missing.png', endpoint: 'http://e/files', jwt: 'j' }),
        /File not found/
      )
    })

    it('should require a filePath, endpoint, and jwt', () => {
      assert.throws(() => uut.upload({}), /filePath must be a string/)
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      assert.throws(
        () => uut.upload({ filePath: '/a.png', jwt: 'j' }),
        /endpoint must be a string/
      )
      assert.throws(
        () => uut.upload({ filePath: '/a.png', endpoint: 'http://e/files' }),
        /jwt is required/
      )
    })

    it('should resolve the normalized stored name on success', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 12 })
      sandbox.stub(uut.fs, 'createReadStream').returns({ path: '/art/my file.png' })

      let options
      sandbox.stub(uut, 'Upload').callsFake(function (stream, opts) {
        options = opts
        return {
          start () {
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })

      const name = await uut.upload({
        filePath: '/art/my file.png',
        endpoint: 'http://e/files',
        jwt: 'jwt-1'
      })

      assert.equal(name, 'my-file.png')
      assert.equal(options.metadata.filename, 'my file.png')
      assert.equal(options.uploadSize, 12)
      assert.equal(options.headers.Authorization, 'Bearer jwt-1')
    })

    it('should reject when the upload fails', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 1 })
      sandbox.stub(uut.fs, 'createReadStream').returns({})
      sandbox.stub(uut, 'Upload').callsFake(function (stream, opts) {
        return {
          start () {
            queueMicrotask(() => opts.onError(new Error('tus failed')))
          }
        }
      })

      try {
        await uut.upload({ filePath: '/a.png', endpoint: 'http://e/files', jwt: 'j' })
        assert.fail('expected rejection')
      } catch (err) {
        assert.include(err.message, 'tus failed')
      }
    })

    it('should log progress when the upload completes', async () => {
      sandbox.stub(uut.fs, 'existsSync').returns(true)
      sandbox.stub(uut.fs, 'statSync').returns({ size: 10 })
      sandbox.stub(uut.fs, 'createReadStream').returns({})
      const log = sandbox.stub(console, 'log')
      sandbox.stub(uut, 'Upload').callsFake(function (stream, opts) {
        return {
          start () {
            opts.onProgress(10, 10)
            queueMicrotask(() => opts.onSuccess())
          }
        }
      })

      const progress = sandbox.stub()
      await uut.upload({
        filePath: '/a.png',
        endpoint: 'http://e/files',
        jwt: 'j',
        label: 'asset',
        onProgress: progress
      })

      sinon.assert.calledWith(log, sinon.match(/Tus asset: upload complete/))
      sinon.assert.calledWith(progress, 10, 10)
    })
  })
})
