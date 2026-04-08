/*
  Show API base URL and login status (saved session email when logged in).
*/

// Global npm libraries
import Table from 'cli-table'

// Local libraries
import config from '../../config/index.js'
import AppUtils from '../lib/app-utils.js'

const appUtils = new AppUtils()

class Info {
  constructor () {
    this.Table = Table
    this.config = config
    this.appUtils = appUtils

    this.run = this.run.bind(this)
    this.validateFlags = this.validateFlags.bind(this)
    this.buildTable = this.buildTable.bind(this)
  }

  async run (flags) {
    try {
      this.validateFlags(flags)

      const { apiBaseUrl } = this.config
      const loginDisplay = await this.resolveLoginDisplay()

      this.buildTable({ apiBaseUrl, loginDisplay })

      return true
    } catch (err) {
      console.error('Error in info: ', err)
      return 0
    }
  }

  validateFlags (_flags) {
    return true
  }

  async resolveLoginDisplay () {
    try {
      const session = await this.appUtils.getSessionInfo('user.json')
      if (!session.JWT) return 'not logged in'
      const email = session.user?.email
      if (email) return `logged in as ${email}`
      return 'logged in'
    } catch {
      return 'not logged in'
    }
  }

  buildTable ({ apiBaseUrl, loginDisplay }) {
    const table = new Table({
      head: ['Setting', 'Value'],
      colWidths: [28, 50]
    })

    table.push(
      ['API base URL', apiBaseUrl],
      ['Login', loginDisplay]
    )

    const tableStr = table.toString()
    console.log(tableStr)

    return tableStr
  }
}

export default Info
