/*
  List bulk tokenization jobs for the logged-in user.

  The API returns one row per job plus per-batch status counts. Optional
  filters are passed through: status (queued, processing, completed, failed)
  and projectId (collection id).
*/

import axios from 'axios'
import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import { BULK_STATUSES } from '../lib/bulk-manifest.js'

const appUtils = new AppUtils()

class ShowBulkJobs {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table

    this.run = this.run.bind(this)
    this.validateFlags = this.validateFlags.bind(this)
    this.loadSession = this.loadSession.bind(this)
    this.fetchJobs = this.fetchJobs.bind(this)
    this.printBatches = this.printBatches.bind(this)
    this.printItems = this.printItems.bind(this)
    this.printError = this.printError.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)
      const { base, jwt, userId } = await this.loadSession()

      const params = {}
      if (flags.status) params.status = flags.status
      if (flags.project) params.projectId = flags.project

      const data = await this.fetchJobs(base, jwt, userId, params)
      this.printBatches(data.batches)
      this.printItems(data.items)
      return true
    } catch (err) {
      this.printError(err, 'show-bulk-jobs/run()')
      return 0
    }
  }

  validateFlags (flags = {}) {
    if (flags.status && !BULK_STATUSES.includes(flags.status)) {
      throw new Error(`--status must be one of: ${BULK_STATUSES.join(', ')}.`)
    }
    if (flags.project !== undefined && typeof flags.project !== 'string') {
      throw new Error('--project must be a string.')
    }
    return true
  }

  async loadSession () {
    const session = await this.appUtils.getSessionInfo('user.json')
    const jwt = session.JWT
    const userId = session.user?._id ?? session.user?.id
    if (!jwt) {
      throw new Error('No JWT in session. Run login first.')
    }
    if (!userId) {
      throw new Error('No user id in session. Run login again.')
    }
    const base = this.config.apiBaseUrl.replace(/\/$/, '')
    return { base, jwt, userId: String(userId), session }
  }

  async fetchJobs (base, jwt, userId, params) {
    const res = await this.axios.get(
      `${base}/macro/payload/bulk/user/${encodeURIComponent(userId)}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        },
        params
      }
    )
    const data = res.data
    if (!data?.success) {
      throw new Error('Could not load bulk jobs.')
    }
    return {
      items: Array.isArray(data.items) ? data.items : [],
      batches: Array.isArray(data.batches) ? data.batches : []
    }
  }

  printBatches (batches) {
    console.log('Batches')
    const table = new this.Table({
      head: ['batchId', 'projectId', 'queued', 'processing', 'completed', 'failed', 'total'],
      colWidths: [30, 26, 10, 12, 12, 10, 8]
    })
    if (batches.length === 0) {
      table.push(['—', '', '', '', '', '', ''])
    } else {
      for (const batch of batches) {
        table.push([
          String(batch.batchId ?? ''),
          String(batch.projectId ?? ''),
          String(batch.queued ?? 0),
          String(batch.processing ?? 0),
          String(batch.completed ?? 0),
          String(batch.failed ?? 0),
          String(batch.itemCount ?? 0)
        ])
      }
    }
    console.log(table.toString())
  }

  printItems (items) {
    console.log('Jobs')
    const table = new this.Table({
      head: ['batchId', 'Title', 'Status', 'Payload', 'Txid', 'Error'],
      colWidths: [30, 24, 12, 26, 66, 30]
    })
    if (items.length === 0) {
      table.push(['—', '', '', '', '', ''])
    } else {
      for (const item of items) {
        table.push([
          String(item.batchId ?? ''),
          String(item.title ?? ''),
          String(item.status ?? ''),
          String(item.payloadId ?? ''),
          String(item.txid ?? ''),
          String(item.error ?? '')
        ])
      }
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

export default ShowBulkJobs
