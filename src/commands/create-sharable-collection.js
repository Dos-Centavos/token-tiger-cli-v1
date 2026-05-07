/*
  Create a sharable NFT collection — same body as token-tiger-v1 newSharableCollection().
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

class CreateSharableCollection {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.run = this.run.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)
      const jwt = session.JWT
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }

      const collectionLabel = flags.name.trim()
      const isPublic = Boolean(flags.public)

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const endpoint = `${base}/users/share/nft/create`

      const res = await this.axios.post(
        endpoint,
        {
          sharableCollection: {
            collectionLabel,
            isPublic
          }
        },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json'
          }
        }
      )
      const data = res.data
      if (!data?.success || !data.user?._id) {
        throw new Error('Failed to create sharable collection.')
      }

      const list = data.user.nftSharedCollections
      if (!Array.isArray(list) || list.length === 0) {
        throw new Error(
          'Server response did not include the new sharable collection.'
        )
      }
      const created = list[list.length - 1]

      session.user = { ...session.user, ...data.user }
      await this.appUtils.saveUserData(filename, session)

      console.log('Sharable collection created successfully.')
      if (created.collectionLabel != null) {
        console.log(`Label: ${created.collectionLabel}`)
      }
      if (created.publicId != null) {
        console.log(`Id: ${created.publicId}`)
      }
      if (created.bchAddress != null) {
        console.log(`BCH address: ${created.bchAddress}`)
      }
      console.log(`Public: ${created.isPublic ? 'yes' : 'no'}`)

      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in create-sharable-collection/run(): ', err)
      }

      return 0
    }
  }

  validateFlags (flags) {
    if (!flags.name || String(flags.name).trim() === '') {
      throw new Error('You must provide a collection name with -n / --name.')
    }
    return true
  }
}

export default CreateSharableCollection
