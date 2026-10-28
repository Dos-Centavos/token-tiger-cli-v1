/*
  Manifest loading, validation, and payload shaping for bulk tokenization.

  The pearson-api bulk endpoints accept at most 10 items per batch. Create
  items may carry metadata and customData; append items inherit project,
  metadata, customData, gallery, and destination from the batch template
  (src/use-cases/bulk-payload-use-cases.js:buildAppendedItem), so only the
  file names and title are sent when appending.
*/

import fs from 'fs'
import path from 'path'

const MAX_ITEMS = 10
const BULK_STATUSES = ['queued', 'processing', 'completed', 'failed']

function isPlainObject (value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function fileExtension (filePath) {
  const ext = path.extname(String(filePath || '')).replace(/^\./, '').toLowerCase()
  // Matches the existing create-token helper, including its 'unknow' spelling.
  return ext || 'unknow'
}

function titleFromPath (filePath) {
  const base = path.basename(String(filePath || ''))
  const ext = path.extname(base)
  const stem = ext ? base.slice(0, -ext.length) : base
  return stem || base || 'Untitled'
}

function optionalString (value, fallback, field, index) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string') {
    throw new Error(`items[${index}].${field} must be a string.`)
  }
  return value
}

function optionalBoolean (value, fallback, field, index) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') {
    throw new Error(`items[${index}].${field} must be a boolean.`)
  }
  return value
}

function optionalObject (value, field, index) {
  if (value === undefined || value === null) return {}
  if (!isPlainObject(value)) {
    throw new Error(`items[${index}].${field} must be an object.`)
  }
  return value
}

class BulkManifest {
  constructor (localConfig = {}) {
    this.fs = localConfig.fs ?? fs
    this.maxItems = localConfig.maxItems ?? MAX_ITEMS

    this.load = this.load.bind(this)
    this.validate = this.validate.bind(this)
    this.validateItem = this.validateItem.bind(this)
    this.buildCreateItems = this.buildCreateItems.bind(this)
    this.buildAppendItems = this.buildAppendItems.bind(this)
    this.buildMetadata = this.buildMetadata.bind(this)
    this.buildCustomData = this.buildCustomData.bind(this)
  }

  load (manifestPath) {
    if (!manifestPath || typeof manifestPath !== 'string') {
      throw new Error('You must provide a manifest path with -m / --manifest.')
    }
    if (!this.fs.existsSync(manifestPath)) {
      throw new Error(`Manifest not found: ${manifestPath}`)
    }

    const raw = this.fs.readFileSync(manifestPath, 'utf8')
    try {
      return JSON.parse(raw)
    } catch (err) {
      throw new Error(`Invalid JSON in manifest ${manifestPath}: ${err.message}`)
    }
  }

  validate (manifest) {
    if (!isPlainObject(manifest)) {
      throw new Error('Manifest must be a JSON object.')
    }
    if (!Array.isArray(manifest.items)) {
      throw new Error("Manifest property 'items' must be an array.")
    }
    if (manifest.items.length === 0) {
      throw new Error("Manifest property 'items' must not be empty.")
    }
    if (manifest.items.length > this.maxItems) {
      throw new Error(`A batch cannot contain more than ${this.maxItems} items.`)
    }
    if (manifest.collection !== undefined && typeof manifest.collection !== 'string') {
      throw new Error("Manifest property 'collection' must be a string.")
    }

    return manifest.items.map((item, index) => this.validateItem(item, index))
  }

  validateItem (item, index) {
    if (!isPlainObject(item)) {
      throw new Error(`items[${index}] must be an object.`)
    }

    const file = item.file
    const thumbnail = item.thumbnail
    if (!file || typeof file !== 'string') {
      throw new Error(`items[${index}].file must be a string.`)
    }
    if (!thumbnail || typeof thumbnail !== 'string') {
      throw new Error(`items[${index}].thumbnail must be a string.`)
    }
    if (!this.fs.existsSync(file)) {
      throw new Error(`items[${index}].file not found: ${file}`)
    }
    if (!this.fs.existsSync(thumbnail)) {
      throw new Error(`items[${index}].thumbnail not found: ${thumbnail}`)
    }

    const title = optionalString(item.title, titleFromPath(file), 'title', index)
    const rawAddress = item.address !== undefined ? item.address : item.destAddr
    const address = optionalString(rawAddress, '', 'address', index)

    return {
      file,
      thumbnail,
      title: title.trim() === '' ? titleFromPath(file) : title,
      address,
      public: optionalBoolean(item.public, false, 'public', index),
      addToGallery: optionalBoolean(item.addToGallery, false, 'addToGallery', index),
      url: optionalString(item.url, '', 'url', index),
      description: optionalString(item.description, '', 'description', index),
      nsfw: optionalBoolean(item.nsfw, false, 'nsfw', index),
      metadata: optionalObject(item.metadata, 'metadata', index),
      customData: optionalObject(item.customData, 'customData', index)
    }
  }

  buildCreateItems ({ items, projectId, userId, email } = {}) {
    if (!Array.isArray(items)) {
      throw new Error('items must be an array.')
    }
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('projectId must be a string.')
    }
    if (!userId || typeof userId !== 'string') {
      throw new Error('userId must be a string.')
    }

    return items.map((item) => ({
      originalFileName: item.originalFileName || item.file,
      thumbnailFileName: item.thumbnailFileName || item.thumbnail,
      projectId,
      title: item.title,
      metadata: this.buildMetadata({ item, projectId, userId, email }),
      customData: this.buildCustomData(item),
      addToGallery: Boolean(item.addToGallery),
      destAddr: item.address || null
    }))
  }

  buildAppendItems ({ items } = {}) {
    if (!Array.isArray(items)) {
      throw new Error('items must be an array.')
    }
    return items.map((item) => ({
      file: item.file,
      thumbnail: item.thumbnail,
      title: item.title
    }))
  }

  buildMetadata ({ item, projectId, userId, email }) {
    const base = {
      schemaVersion: 1,
      projectId,
      userIdUpload: userId,
      title: item.title,
      isNDA: false,
      owner: userId,
      meta: {
        fileData: [fileExtension(item.file)],
        filePreview: '',
        emailOwner: email || ''
      }
    }
    if (item.public) {
      base.isPubliclyAvailable = true
    }

    const overrides = item.metadata || {}
    const merged = Object.assign({}, base, overrides)
    merged.meta = Object.assign({}, base.meta, overrides.meta || {})
    return merged
  }

  buildCustomData (item = {}) {
    const raw = item.customData || {}
    const baseUserData = {
      currentUrl: item.url || '',
      templateMetadata: {}
    }
    const merged = Object.assign({}, {
      issuerUrl: item.url || '',
      nsfw: Boolean(item.nsfw),
      about: item.description || '',
      ticker: 'NFT',
      userData: baseUserData
    }, raw)
    merged.userData = Object.assign(
      {},
      baseUserData,
      isPlainObject(raw.userData) ? raw.userData : {}
    )
    return merged
  }
}

export { MAX_ITEMS, BULK_STATUSES, fileExtension, titleFromPath }
export default BulkManifest
