/*
  Create a collection — same body shape as token-tiger-v1 newProject().
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

const ALLOWED_PROJECT_TOKENS_TYPES = Object.freeze([1, 65])

class CreateCollection {
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

      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const endpoint = `${base}/projects/`
      const project = {
        schemaVersion: 1,
        projectLabel: flags.name.trim()
      }
      if (this.shouldIncludeTokensType(flags)) {
        project.tokensType = Number(flags.tokensType)
      }

      const res = await this.axios.post(
        endpoint,
        { project },
        {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json'
          }
        }
      )
      const data = res.data
      if (!data?.success || !data.project?._id) {
        throw new Error('Failed to create collection.')
      }

      const id = data.project._id
      await this.persistProjectOnSession(session, id, filename)

      const label =
        data.project.projectLabel != null && String(data.project.projectLabel).trim() !== ''
          ? String(data.project.projectLabel).trim()
          : project.projectLabel
      console.log('Collection created successfully.')
      console.log(`Collection id: ${id}`)
      console.log(`Label: ${label}`)
      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else if (err.message) {
        console.log(err.message)
      } else {
        console.log('Error in create-collection/run(): ', err)
      }

      return 0
    }
  }

  shouldIncludeTokensType (flags) {
    if (flags.tokensType === undefined || flags.tokensType === null) return false
    if (typeof flags.tokensType === 'string' && flags.tokensType.trim() === '') return false
    return true
  }

  validateFlags (flags) {
    if (!flags.name || String(flags.name).trim() === '') {
      throw new Error('You must provide a collection name with -n / --name.')
    }
    if (this.shouldIncludeTokensType(flags)) {
      const n = Number(flags.tokensType)
      if (!ALLOWED_PROJECT_TOKENS_TYPES.includes(n)) {
        throw new Error(
          'tokens-type must be 1 or 65 (integer). Omit the flag if the API should choose a default.'
        )
      }
    }
    return true
  }

  async persistProjectOnSession (session, id, filename) {
    if (!session.projects) session.projects = []
    if (!session.projects.includes(id)) session.projects.push(id)
    if (session.user) {
      if (!Array.isArray(session.user.projects)) session.user.projects = []
      if (!session.user.projects.includes(id)) session.user.projects.push(id)
    }
    await this.appUtils.saveUserData(filename, session)
  }
}

export default CreateCollection
