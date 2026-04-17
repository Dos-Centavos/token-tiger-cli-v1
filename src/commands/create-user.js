/*
    Create a Token Tiger account (POST /users) and persist session like login.
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import axios from 'axios'

const appUtils = new AppUtils()

class CreateUser {
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

      return await this.createUser(filename, flags.email, flags.password)
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log('Error in create-user.js/run(): ', err)

      return 0
    }
  }

  async createUser (filename, email, password) {
    try {
      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const endpoint = `${base}/users`
      const result = await this.axios.post(endpoint, {
        user: {
          email,
          password
        }
      })
      const JWT = result.data.token
      const data = {
        JWT,
        projects: result.data.user.projects,
        user: result.data.user
      }
      await this.appUtils.saveUserData(filename, data)
      console.log('User created successfully!')
      console.log(`JWT : ${JWT}`)
      return true
    } catch (err) {
      if (err.response?.data) {
        console.log(JSON.stringify(err.response.data, null, 2))
      } else {
        console.log('Error in createUser().', err.message)
      }
      throw err
    }
  }

  validateFlags (flags) {
    const { email, password } = flags
    if (!email || email === '') {
      throw new Error('You must provide an email with the -e flag.')
    }
    if (!password || password === '') {
      throw new Error('You must provide a password with the -p flag.')
    }

    return true
  }
}

export default CreateUser
