/*
  Export a token to an SLP or BCH wallet — mirrors token-tiger-v1 exportProjectToken /
  exportSharableToken; routing uses the same collection id inference as show-collection-tokens.
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'
import { classifyCollectionTokenId } from '../lib/collection-id.js'

import axios from 'axios'

const appUtils = new AppUtils()

function validateDestinationAddress (address) {
  const s = String(address).trim()
  if (
    !s.startsWith('simpleledger:') &&
    !s.startsWith('bitcoincash:')
  ) {
    throw new Error(
      'Destination must be a simpleledger: or bitcoincash: address.'
    )
  }
  return s
}

class ExportToken {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.run = this.run.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const classified = classifyCollectionTokenId(flags.collection)
      const tokenId = String(flags.tokenId).trim()
      const slpAddress = validateDestinationAddress(flags.address)

      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)
      const jwt = session.JWT
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const headers = {
        Accept: 'application/json',
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json'
      }

      let res
      if (classified.kind === 'collection') {
        res = await this.axios.post(
          `${base}/token/export/project`,
          {
            projectId: classified.id,
            tokenId,
            slpAddress
          },
          { headers }
        )
        console.log(`Export from collection ${classified.id}`)
      } else {
        res = await this.axios.post(
          `${base}/token/export/sharable`,
          {
            tokenId,
            slpAddress,
            publicId: classified.id
          },
          { headers }
        )
        console.log(`Export from sharable collection (publicId ${classified.id})`)
      }

      const data = res.data
      console.log('Export successful. Transaction ID:')
      if (data?.result != null) {
        const r = data.result
        console.log(Array.isArray(r) ? JSON.stringify(r, null, 2) : String(r))
      } else {
        console.log(JSON.stringify(data ?? {}, null, 2))
      }

      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in export-token/run(): ', err)
      }

      return 0
    }
  }

  validateFlags (flags) {
    if (!flags.collection || String(flags.collection).trim() === '') {
      throw new Error('You must provide -c / --collection <id>.')
    }
    if (!flags.tokenId || String(flags.tokenId).trim() === '') {
      throw new Error('You must provide -t / --token-id <tokenId>.')
    }
    if (!flags.address || String(flags.address).trim() === '') {
      throw new Error('You must provide -a / --address <address>.')
    }
    validateDestinationAddress(flags.address)
    return true
  }
}

export default ExportToken
