/*
  Queue a bulk tokenization batch.

  Flow: resolve collection, upload every asset and thumbnail with Tus, then
  POST /macro/payload/bulk. Minting is asynchronous on the API: a timer worker
  claims queued jobs every 15 seconds. Poll with show-bulk-batch.
*/

import axios from 'axios'
import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import BulkManifest from '../lib/bulk-manifest.js'
import TusUploader from '../lib/tus-upload.js'

import CreateToken from './create-token.js'

const appUtils = new AppUtils()

class CreateBulkTokens {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table
    this.manifest = new BulkManifest()
    this.uploader = new TusUploader()
    // Reuse the collection resolution already implemented and tested for
    // create-token (owner checks, last-NFT fallback, default collection).
    this.collectionResolver = new CreateToken()

    this.run = this.run.bind(this)
    this.validateFlags = this.validateFlags.bind(this)
    this.loadSession = this.loadSession.bind(this)
    this.jsonHeaders = this.jsonHeaders.bind(this)
    this.printPlan = this.printPlan.bind(this)
    this.printError = this.printError.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const { base, jwt, user, session } = await this.loadSession()
      const rawManifest = this.manifest.load(flags.manifest)
      const items = this.manifest.validate(rawManifest).map((item) => ({
        ...item,
        address: item.address || (flags.address ? String(flags.address) : ''),
        addToGallery: Boolean(flags.gallery) || item.addToGallery
      }))
      console.log(`[create-bulk-tokens] Loaded ${items.length} item(s) from ${flags.manifest}`)

      const collection = flags.collection || rawManifest.collection || ''
      let projectId = '(auto)'
      let projectLabel = '(auto)'
      if (!flags.dryRun || collection) {
        const resolved = await this.collectionResolver.resolveCollectionId({
          base,
          jwt,
          flags: { collection },
          session,
          user
        })
        projectId = resolved.projectId
        projectLabel = resolved.projectLabel
        console.log(`[create-bulk-tokens] Collection: "${projectLabel}" (${projectId})`)
      } else {
        console.log(
          '[create-bulk-tokens] Dry run: the collection would be resolved at run time (last NFT collection, or a new one).'
        )
      }

      const userId = String(user._id ?? user.id)
      let uploaded = items

      if (!flags.dryRun) {
        uploaded = []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          console.log(
            `[create-bulk-tokens] Uploading item ${i + 1}/${items.length}: ${item.title}`
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
          uploaded.push({ ...item, originalFileName, thumbnailFileName })
        }
      }

      const apiItems = this.manifest.buildCreateItems({
        items: uploaded,
        projectId,
        userId,
        email: user.email
      })

      if (flags.dryRun) {
        console.log('[create-bulk-tokens] Dry run: no files uploaded and no batch queued.')
        this.printPlan(apiItems)
        return true
      }

      const res = await this.axios.post(
        `${base}/macro/payload/bulk`,
        { items: apiItems },
        { headers: this.jsonHeaders(jwt) }
      )
      const data = res.data
      if (!data?.success || !data.batchId) {
        throw new Error('Bulk batch creation failed.')
      }

      console.log(`Batch id: ${data.batchId}`)
      console.log(`Queued ${data.itemCount ?? apiItems.length} item(s); status: ${data.status ?? 'queued'}`)
      console.log(
        `Poll with: node token-tiger-cli.js show-bulk-batch -b ${data.batchId} --watch`
      )
      return true
    } catch (err) {
      this.printError(err, 'create-bulk-tokens/run()')
      return 0
    }
  }

  validateFlags (flags = {}) {
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

  jsonHeaders (jwt) {
    return {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
  }

  printPlan (apiItems) {
    const table = new this.Table({
      head: ['Title', 'Asset', 'Thumbnail', 'Gallery', 'Dest'],
      colWidths: [28, 34, 34, 8, 28]
    })
    for (const item of apiItems) {
      table.push([
        String(item.title ?? ''),
        String(item.originalFileName ?? ''),
        String(item.thumbnailFileName ?? ''),
        item.addToGallery ? 'yes' : 'no',
        String(item.destAddr ?? '')
      ])
    }
    console.log(table.toString())
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

export default CreateBulkTokens
