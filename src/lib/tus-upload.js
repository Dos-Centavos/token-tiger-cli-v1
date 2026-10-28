/*
  TUS upload helper for bulk commands.

  The pearson-api TUS handler renames each completed upload from its original
  metadata filename to the same name with whitespace replaced by '-'
  (src/controllers/rest-api/files/controller.js). Bulk items are queued with the
  name the server stored, so this helper returns the normalized name.
*/

import fs from 'fs'
import path from 'path'

import { Upload } from 'tus-js-client'

const DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024
const DEFAULT_RETRY_DELAYS = [0, 3000, 5000, 10000]

function guessFileType (filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  }
  return map[ext] || 'application/octet-stream'
}

/** Name the TUS handler stores for a completed upload. */
export function normalizeUploadName (filePath) {
  const base = path.basename(String(filePath || ''))
  const normalized = base.replace(/\s+/g, '-')
  return normalized || 'upload'
}

class TusUploader {
  constructor (localConfig = {}) {
    this.fs = localConfig.fs ?? fs
    this.path = path
    this.Upload = localConfig.Upload ?? Upload
    this.upload = this.upload.bind(this)
  }

  upload ({ filePath, endpoint, jwt, label = 'file', onProgress } = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('filePath must be a string.')
    }
    if (!this.fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    if (!endpoint || typeof endpoint !== 'string') {
      throw new Error('endpoint must be a string.')
    }
    if (!jwt) {
      throw new Error('jwt is required.')
    }

    const size = this.fs.statSync(filePath).size
    const stream = this.fs.createReadStream(filePath)
    const filename = this.path.basename(filePath)
    const filetype = guessFileType(filePath)

    return new Promise((resolve, reject) => {
      // Pass the fs ReadStream directly. tus-js-client wraps it via FileSource
      // when stream.path is set, which is how the existing create-token command
      // uploads files.
      const upload = new this.Upload(stream, {
        endpoint,
        uploadSize: size,
        metadata: {
          filename,
          filetype
        },
        headers: {
          Authorization: `Bearer ${jwt}`
        },
        retryDelays: DEFAULT_RETRY_DELAYS,
        chunkSize: DEFAULT_CHUNK_SIZE,
        onProgress: (bytesSent, bytesTotal) => {
          if (onProgress) onProgress(bytesSent, bytesTotal)
          if (bytesTotal > 0 && bytesSent === bytesTotal) {
            console.log(`[bulk] Tus ${label}: upload complete (${bytesSent}/${bytesTotal} bytes)`)
          }
        },
        onError: reject,
        onSuccess: () => resolve(normalizeUploadName(filePath))
      })
      upload.start()
    })
  }
}

export { guessFileType }
export default TusUploader
