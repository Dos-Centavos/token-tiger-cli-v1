/*
  Primary entry point for the Token Tiger CLI.
  Uses commander.js.
*/

// Global npm libraries
import { Command } from 'commander'

// Local libraries
import CheckBalance from './src/commands/check-balance.js'
import Info from './src/commands/info.js'
import Login from './src/commands/login.js'

// Instantiate subcommands
const checkBalance = new CheckBalance()
const info = new Info()
const login = new Login()

const program = new Command()

program
  .name('token-tiger')
  .description('Token Tiger CLI — login, check balance, and inspect configuration.')

program.command('check-balance')
  .description('Check available credits')
  .action(checkBalance.run)

program.command('info')
  .description('Show login status')
  .action(info.run)

program.command('login')
  .description('Sign in and save session')
  .requiredOption('-e, --email <string>', 'account email')
  .requiredOption('-p, --password <string>', 'account password')
  .action(login.run)

program.parseAsync(process.argv)
