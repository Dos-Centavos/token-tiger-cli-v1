/*
  Append jobs to an existing bulk tokenization batch.

  The API takes projectId, metadata, customData, addToGallery, and destAddr
  from the oldest row in the batch. Only originalFileName, thumbnailFileName,
  and title from this manifest are sent.
*/

import axios from 'axios'
import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import BulkManifest from '../lib/bulk-manifest.js'
import TusUploader from '../lib/tus-upload.js'

const appUtils = new AppUtils()

class AppendBulkTokens {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table
    this.manifest = new BulkManifest()
    this.uploader = new TusUploader()

    this.run = this.run.bind(this)
    this.validateFlags = this.validateFlags.bind(this)
    this.loadSession = this.loadSession.bind(this)
    this.fetchBatch = this.fetchBatch.bind(this)
    this.jsonHeaders = this.jsonHeaders.bind(this)
    this.printPlan = this.printPlan.bind(this)
    this.printError = this.printError.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const { base, jwt } = await this.loadSession()
      const rawManifest = this.manifest.load(flags.manifest)
      const items = this.manifest.validate(rawManifest)
      const appendItems = this.manifest.buildAppendItems({ items })

      const batch = await this.fetchBatch(base, jwt, flags.batch)
      const existing = Array.isArray(batch.items) ? batch.items.length : 0
      if (existing + appendItems.length > this.manifest.maxItems) {
        throw new Error(
          `Batch ${flags.batch} already has ${existing} item(s); adding ${appendItems.length} would exceed the ${this.manifest.maxItems}-item limit.`
        )
      }

      console.log(
        '[append-bulk-tokens] The API uses the batch template for project, metadata, customData, gallery, and destination; only file names and title are sent.'
      )
      console.log(
        `[append-bulk-tokens] Batch ${flags.batch}: ${existing} existing item(s), appending ${appendItems.length}`
      )

      if (flags.dryRun) {
        console.log('[append-bulk-tokens] Dry run: no files uploaded and nothing queued.')
        this.printPlan(appendItems, existing)
        return true
      }

      const uploaded = []
      for (let i = 0; i < appendItems.length; i++) {
        const item = appendItems[i]
        console.log(
          `[append-bulk-tokens] Uploading item ${i + 1}/${appendItems.length}: ${item.title}`
        )
        const originalFileName = await this.uploader.upload({
          filePath: item.file,
          endpoint: `${base}/files`,
          jwt,
          label: `item ${i + 1} asset`
        })
        const thumbnailFileName = await this.uploader.upload({
          filePath: item.thumbnail,
          endpoint: `${base}/files`,
          jwt,
          label: `item ${i + 1} thumbnail`
        })
        uploaded.push({
          originalFileName,
          thumbnailFileName,
          title: item.title
        })
      }

      const res = await this.axios.post(
        `${base}/macro/payload/bulk/${encodeURIComponent(flags.batch)}/items`,
        { items: uploaded },
        { headers: this.jsonHeaders(jwt) }
      )
      const data = res.data
      if (!data?.success || !data.batchId) {
        throw new Error('Bulk batch append failed.')
      }

      console.log(`Batch id: ${data.batchId}`)
      console.log(`Queued ${data.itemCount ?? uploaded.length} new item(s); status: ${data.status ?? 'queued'}`)
      console.log(
        `Poll with: node token-tiger-cli.js show-bulk-batch -b ${data.batchId} --watch`
      )
      return true
    } catch (err) {
      this.printError(err, 'append-bulk-tokens/run()')
      return 0
    }
  }

  validateFlags (flags = {}) {
    if (!flags.batch || String(flags.batch).trim() === '') {
      throw new Error('You must provide a batch id with -b / --batch.')
    }
    if (!flags.manifest || String(flags.manifest).trim() === '') {
      throw new Error('You must provide a manifest path with -m / --manifest.')
    }
    return true
  }

  async loadSession () {
    const session = await this.appUtils.getSessionInfo('user.json')
    const jwt = session.JWT
    const user = session.user
    if (!jwt) {
      throw new Error('No JWT in session. Run login first.')
    }
    if (!user?._id && !user?.id) {
      throw new Error('No user id in session. Run login again.')
    }
    const base = this.config.apiBaseUrl.replace(/\/$/, '')
    return { base, jwt, user, session }
  }

  async fetchBatch (base, jwt, batchId) {
    const res = await this.axios.get(
      `${base}/macro/payload/bulk/${encodeURIComponent(batchId)}`,
      { headers: this.jsonHeaders(jwt) }
    )
    const data = res.data
    if (!data?.success || !Array.isArray(data.items)) {
      throw new Error('Could not load the batch.')
    }
    return data
  }

  jsonHeaders (jwt) {
    return {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  }

  printPlan (items, existing) {
    const table = new this.Table({
      head: ['Title', 'Asset', 'Thumbnail'],
      colWidths: [30, 40, 40]
    })
    for (const item of items) {
      table.push([String(item.title ?? ''), String(item.file ?? ''), String(item.thumbnail ?? '')])
    }
    console.log(table.toString())
    console.log(`Batch would contain ${existing + items.length} item(s).`)
  }

  printError (err, context) {
    if (err.response?.data) {
      console.log(JSON.stringify(err.response.data, null, 2))
    } else if (err.message) {
      console.log(err.message)
    } else {
      console.log(`Error in ${context}: `, err)
    }
  }
}

export default AppendBulkTokens
