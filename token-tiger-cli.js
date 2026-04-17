/*
  Primary entry point for the Token Tiger CLI.
  Uses commander.js.
*/

// Global npm libraries
import { Command } from 'commander'

// Local libraries
import CheckBalance from './src/commands/check-balance.js'
import CreateToken from './src/commands/create-token.js'
import CreateUser from './src/commands/create-user.js'
import Info from './src/commands/info.js'
import Login from './src/commands/login.js'

// Instantiate subcommands
const checkBalance = new CheckBalance()
const createToken = new CreateToken()
const createUser = new CreateUser()
const info = new Info()
const login = new Login()

const program = new Command()

program
  .name('token-tiger')
  .description('Token Tiger CLI — login, check balance, and inspect configuration.')

program.command('check-balance')
  .description('Check available credits')
  .action(checkBalance.run)

program.command('create-user')
  .description('Create an account and save session')
  .requiredOption('-e, --email <string>', 'account email')
  .requiredOption('-p, --password <string>', 'account password')
  .action(createUser.run)

program.command('create-token')
  .description('Create an NFT (upload via Tus, metadata, tokenize)')
  .requiredOption('-n, --name <string>', 'token title')
  .requiredOption('-f, --file <path>', 'path to main asset file')
  .requiredOption('-t, --thumbnail <path>', 'path to thumbnail image')
  .option('-c, --collection <id>', 'collection id; if omitted, uses your last NFT collection or creates one.')
  .option('-u, --url <string>', 'issuer / profile URL', '')
  .option('-d, --description <string>', 'about text', '')
  .option('--nsfw', 'mark sensitive content', false)
  .option('--skip-gallery', 'do not add token to inbox gallery ', false)
  .option('-p, --public', 'mark metadata as publicly available')
  .option('-a, --address <string>', 'optional destination address for tokenization')
  .action(createToken.run)

program.command('info')
  .description('Show login status')
  .action(info.run)

program.command('login')
  .description('Sign in and save session')
  .requiredOption('-e, --email <string>', 'account email')
  .requiredOption('-p, --password <string>', 'account password')
  .action(login.run)

program.parseAsync(process.argv)
