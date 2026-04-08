/*
  Utility library shared across commands (ported from pearson-cli src/util.js).
*/

import fs from 'fs'
import util from 'util'

import { userDataDir, userDataFilePath } from './paths.js'

util.inspect.defaultOptions = {
  showHidden: true,
  colors: true,
  depth: 1
}

class AppUtils {
  constructor () {
    this.fs = fs
  }

  sleep (ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async getSessionInfo (filename) {
    try {
      if (!filename) throw new Error('filename must be a string!')

      const filePath = userDataFilePath(filename)
      const isLogged = this.fs.existsSync(filePath)
      if (!isLogged) throw new Error('User data not found! Run login command.')

      let userInf
      try {
        const raw = this.fs.readFileSync(filePath, 'utf8')
        userInf = JSON.parse(raw)
      } catch (err) {
        if (err.code === 'EEXIT') throw err
        throw new Error(`Could not open ${filePath}`)
      }
      if (!userInf.projects) userInf.projects = []

      return userInf
    } catch (err) {
      if (err.code !== 'EEXIT') console.log('Error in getJWT().')
      throw err
    }
  }

  saveUserData (filename, data) {
    if (!filename) throw new Error('filename must be a string!')

    const exist = this.fs.existsSync(userDataDir)
    if (!exist) {
      this.fs.mkdirSync(userDataDir, { recursive: true })
    }
    const filePath = userDataFilePath(filename)
    return new Promise((resolve, reject) => {
      this.fs.writeFile(filePath, JSON.stringify(data, null, 2), function (err) {
        if (err) {
          console.error(err)
          return reject(err)
        }
        return resolve()
      })
    })
  }
}

export default AppUtils
