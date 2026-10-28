/*
  Show one bulk tokenization batch, optionally polling until every item is
  completed or failed.

  The API worker mints one queued item per timer tick (15 seconds), so a batch
  can stay in progress for several minutes.
*/

import axios from 'axios'
import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import { BULK_STATUSES } from '../lib/bulk-manifest.js'

const appUtils = new AppUtils()

class ShowBulkBatch {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table

    this.run = this.run.bind(this)
    this.validateFlags = this.validateFlags.bind(this)
    this.loadSession = this.loadSession.bind(this)
    this.fetchBatch = this.fetchBatch.bind(this)
    this.watch = this.watch.bind(this)
    this.countStatuses = this.countStatuses.bind(this)
    this.isTerminal = this.isTerminal.bind(this)
    this.printBatch = this.printBatch.bind(this)
    this.now = this.now.bind(this)
    this.printError = this.printError.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)
      const { base, jwt } = await this.loadSession()

      if (flags.watch) {
        return await this.watch(base, jwt, flags)
      }

      const data = await this.fetchBatch(base, jwt, flags.batch)
      this.printBatch(data)
      return true
    } catch (err) {
      this.printError(err, 'show-bulk-batch/run()')
      return 0
    }
  }

  validateFlags (flags = {}) {
    if (!flags.batch || String(flags.batch).trim() === '') {
      throw new Error('You must provide a batch id with -b / --batch.')
    }
    const interval = Number(flags.interval ?? 15)
    if (!Number.isFinite(interval) || interval <= 0) {
      throw new Error('--interval must be a positive number of seconds.')
    }
    const timeout = Number(flags.timeout ?? 0)
    if (!Number.isFinite(timeout) || timeout < 0) {
      throw new Error('--timeout must be zero or a positive number of seconds.')
    }
    return true
  }

  async loadSession () {
    const session = await this.appUtils.getSessionInfo('user.json')
    const jwt = session.JWT
    if (!jwt) {
      throw new Error('No JWT in session. Run login first.')
    }
    const base = this.config.apiBaseUrl.replace(/\/$/, '')
    return { base, jwt, session }
  }

  async fetchBatch (base, jwt, batchId) {
    const res = await this.axios.get(
      `${base}/macro/payload/bulk/${encodeURIComponent(batchId)}`,
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        }
      }
    )
    const data = res.data
    if (!data?.success || !Array.isArray(data.items)) {
      throw new Error('Could not load the batch.')
    }
    return data
  }

  async watch (base, jwt, flags) {
    const intervalMs = Number(flags.interval ?? 15) * 1000
    const timeoutMs = Number(flags.timeout ?? 0) * 1000
    const started = this.now()

    for (;;) {
      const data = await this.fetchBatch(base, jwt, flags.batch)
      const counts = this.countStatuses(data.items)
      console.log(
        `[show-bulk-batch] queued ${counts.queued} | processing ${counts.processing} | completed ${counts.completed} | failed ${counts.failed}`
      )

      if (this.isTerminal(data.items)) {
        this.printBatch(data)
        return true
      }

      if (timeoutMs > 0 && this.now() - started >= timeoutMs) {
        console.log('[show-bulk-batch] Timed out waiting for the batch to finish.')
        this.printBatch(data)
        return 0
      }

      await this.appUtils.sleep(intervalMs)
    }
  }

  countStatuses (items) {
    const counts = {}
    for (const status of BULK_STATUSES) counts[status] = 0
    for (const item of items || []) {
      if (item && counts[item.status] !== undefined) counts[item.status] += 1
    }
    return counts
  }

  isTerminal (items) {
    const list = Array.isArray(items) ? items : []
    return list.every((item) => item && (item.status === 'completed' || item.status === 'failed'))
  }

  printBatch (data) {
    const items = Array.isArray(data.items) ? data.items : []
    const counts = this.countStatuses(items)
    console.log(
      `Batch ${data.batchId}: ${items.length} item(s) | queued ${counts.queued} | processing ${counts.processing} | completed ${counts.completed} | failed ${counts.failed}`
    )

    const table = new this.Table({
      head: ['Title', 'Status', 'Payload', 'Txid', 'Error'],
      colWidths: [28, 12, 26, 66, 36]
    })
    if (items.length === 0) {
      table.push(['—', '', '', '', ''])
    } else {
      for (const item of items) {
        table.push([
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

  now () {
    return Date.now()
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

export default ShowBulkBatch
