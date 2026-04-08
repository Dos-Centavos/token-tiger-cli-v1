/*
  Shared helpers for commands.
*/

// Global npm libraries
import shelljs from 'shelljs'

class CliUtil {
  constructor () {
    // Encapsulate all dependencies
    this.shelljs = shelljs

    // Bind 'this' object to all subfunctions.
    this.echo = this.echo.bind(this)
  }

  echo (msg) {
    this.shelljs.echo(msg)
    return msg
  }
}

export default CliUtil
