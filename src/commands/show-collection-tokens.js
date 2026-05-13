/*
  List tokens for a collection or sharable collection; id format selects the correct API (hex collection id vs numeric publicId).
*/

import Table from 'cli-table'

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import { classifyCollectionTokenId } from '../lib/collection-id.js'

import axios from 'axios'

const appUtils = new AppUtils()

function tokenTableRow (t) {
  const id = t.tokenId ?? t.txid ?? ''
  const qty = t.qty != null ? String(t.qty) : ''
  const label =
    t.name ?? t.ticker ?? t.symbol ?? t.documentUri ?? ''
  return [String(id), qty, String(label).slice(0, 60)]
}

class ShowCollectionTokens {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.Table = Table
    this.run = this.run.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const classified = classifyCollectionTokenId(flags.id)
      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)
      const jwt = session.JWT
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const headers = {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }

      let tokens = []
      if (classified.kind === 'collection') {
        const res = await this.axios.post(
          `${base}/token/project-tokens`,
          { projectId: classified.id },
          { headers }
        )
        tokens = res.data?.tokens ?? []
        console.log(`Collection ${classified.id}`)
      } else {
        const res = await this.axios.get(
          `${base}/users/share/nft/tokens/${classified.id}`,
          { headers }
        )
        tokens = res.data?.tokens ?? []
        console.log(`Sharable collection (publicId ${classified.id})`)
      }

      const table = new this.Table({
        head: ['tokenId', 'qty', 'ticker'],
        colWidths: [70, 10, 62]
      })

      if (!Array.isArray(tokens) || tokens.length === 0) {
        table.push(['—', '', '(no tokens)'])
      } else {
        for (const t of tokens) {
          if (!t) continue
          table.push(tokenTableRow(t))
        }
      }

      console.log(table.toString())

      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in show-collection-tokens/run(): ', err)
      }

      return 0
    }
  }

  validateFlags (flags) {
    if (!flags.id || String(flags.id).trim() === '') {
      throw new Error('You must provide a collection id with -i / --id.')
    }
    return true
  }
}

export default ShowCollectionTokens
