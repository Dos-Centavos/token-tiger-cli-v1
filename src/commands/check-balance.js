/*
  Fetch current user from the API (GET /users/:id) using the saved session JWT.
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

class CheckBalance {
  constructor () {
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.run = this.run.bind(this)
  }

  async run (_flags) {
    try {
      const filename = 'user.json'
      const session = await this.appUtils.getSessionInfo(filename)

      const jwt = session.JWT
      const userId = session.user?._id ?? session.user?.id
      if (!jwt) {
        throw new Error('No JWT in session. Run login first.')
      }
      if (!userId) {
        throw new Error('No user id in session. Run login again.')
      }

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const endpoint = `${base}/users/${userId}`

      const result = await this.axios.get(endpoint, {
        headers: { Authorization: `Bearer ${jwt}` }
      })

      const credit = result.data.user.credit
      console.log(`Available credits: ${credit.available}`)
      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else {
        console.log('Error in check-balance/run(): ', err.message)
      }

      return 0
    }
  }
}

export default CheckBalance
