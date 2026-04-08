/*
    Log into pearson api
*/

import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

import fs from 'fs'
import axios from 'axios'
const appUtils = new AppUtils()

class Login {
  constructor () {
    // _this = this

    this.fs = fs
    this.config = config
    this.axios = axios
    this.appUtils = appUtils
    this.run = this.run.bind(this)
  }

  async run (flags) {
    try {
      // Validate input flags
      this.validateFlags(flags)

      const filename = 'user.json'

      return await this.login(filename, flags.email, flags.password)
    } catch (err) {
      if (err.message) console.log(err.message)
      else console.log('Error in login.js/run(): ', err)

      return 0
    }
  }

  async login (filename, email, password) {
    try {
      const base = this.config.apiBaseUrl.replace(/\/$/, '')
      const endpoint = `${base}/auth`
      const result = await this.axios.post(endpoint, {
        email,
        password
      })
      const JWT = result.data.token
      const data = {
        JWT,
        projects: result.data.user.projects,
        user: result.data.user
      }
      await this.appUtils.saveUserData(filename, data)
      console.log('Login success!')
      console.log(`JWT : ${JWT}`)
      return true
    } catch (err) {
      if (err.code !== 'EEXIT') console.log('Error in login().')
      throw err
    }
  }

  // Validate the proper flags are passed in.
  validateFlags (flags) {
    // Exit if wallet not specified.
    const { email, password } = flags
    if (!email || email === '') {
      throw new Error('You must provide an email with the -e flag.')
    }
    if (!password || password === '') {
      throw new Error('You must provide an password with the -p flag.')
    }

    return true
  }
}

export default Login
