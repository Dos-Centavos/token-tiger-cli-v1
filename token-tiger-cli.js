/*
  Primary entry point for the Token Tiger CLI.
  Uses commander.js.
*/

// Global npm libraries
import { Command } from 'commander'

// Local libraries
import AppendBulkTokens from './src/commands/append-bulk-tokens.js'
import CheckBalance from './src/commands/check-balance.js'
import CreateBulkTokens from './src/commands/create-bulk-tokens.js'
import CreateCollection from './src/commands/create-collection.js'
import CreateSharableCollection from './src/commands/create-sharable-collection.js'
import CreateToken from './src/commands/create-token.js'
import CreateUser from './src/commands/create-user.js'
import ExportToken from './src/commands/export-token.js'
import Info from './src/commands/info.js'
import Login from './src/commands/login.js'
import ShowBulkBatch from './src/commands/show-bulk-batch.js'
import ShowBulkJobs from './src/commands/show-bulk-jobs.js'
import ShowCollectionTokens from './src/commands/show-collection-tokens.js'
import ShowCollections from './src/commands/show-collections.js'

// Instantiate subcommands
const appendBulkTokens = new AppendBulkTokens()
const checkBalance = new CheckBalance()
const createBulkTokens = new CreateBulkTokens()
const createCollection = new CreateCollection()
const createSharableCollection = new CreateSharableCollection()
const createToken = new CreateToken()
const createUser = new CreateUser()
const exportToken = new ExportToken()
const info = new Info()
const login = new Login()
const showBulkBatch = new ShowBulkBatch()
const showBulkJobs = new ShowBulkJobs()
const showCollections = new ShowCollections()
const showCollectionTokens = new ShowCollectionTokens()

const program = new Command()

program
  .name('token-tiger')
  .description('Token Tiger CLI — login, check balance, and inspect configuration.')

program.command('check-balance')
  .description('Check available credits')
  .action(checkBalance.run)

program.command('create-collection')
  .description('Create a new collection')
  .requiredOption('-n, --name <string>', 'collection label')
  .option('-t, --tokens-type <number>', 'optional collection type: 1 (NFT) or 65')
  .action(createCollection.run)

program.command('create-sharable-collection')
  .description('Create a sharable NFT collection')
  .requiredOption('-n, --name <string>', 'collection label')
  .option('--public', 'collection is publicly discoverable', false)
  .action(createSharableCollection.run)

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

program.command('create-bulk-tokens')
  .description('Queue a bulk tokenization batch (upload via Tus, then POST /macro/payload/bulk)')
  .requiredOption('-m, --manifest <path>', 'JSON manifest describing the batch')
  .option('-c, --collection <id>', 'collection id; overrides manifest.collection; if omitted, uses your last NFT collection or creates one.')
  .option('-a, --address <string>', 'default destination address for items without one')
  .option('--gallery', 'add every item to the API inbox gallery', false)
  .option('--dry-run', 'validate and print the plan without uploading or queueing', false)
  .action(createBulkTokens.run)

program.command('append-bulk-tokens')
  .description('Append items to an existing bulk batch (upload via Tus, then POST .../items)')
  .requiredOption('-b, --batch <id>', 'batch id to append to')
  .requiredOption('-m, --manifest <path>', 'JSON manifest describing the items to append')
  .option('--dry-run', 'validate and print the plan without uploading or queueing', false)
  .action(appendBulkTokens.run)

program.command('show-bulk-batch')
  .description('Show one bulk batch, optionally polling until every item finishes')
  .requiredOption('-b, --batch <id>', 'batch id to inspect')
  .option('--watch', 'poll until every item is completed or failed', false)
  .option('--interval <seconds>', 'poll interval in seconds', '15')
  .option('--timeout <seconds>', 'stop watching after N seconds (0 = no timeout)', '0')
  .action(showBulkBatch.run)

program.command('show-bulk-jobs')
  .description('List your bulk tokenization jobs and per-batch status counts')
  .option('--status <status>', 'filter by queued, processing, completed, or failed')
  .option('--project <id>', 'filter by collection / project id')
  .action(showBulkJobs.run)

program.command('export-token')
  .description('Export a token from a collection to an SLP or BCH wallet address')
  .requiredOption('-c, --collection <id>', 'Collection ID currently holding the token')
  .requiredOption('-t, --token-id <string>', 'token id to send')
  .requiredOption('-a, --address <string>', 'destination simpleledger: or bitcoincash: address')
  .action(exportToken.run)

program.command('info')
  .description('Show login status')
  .action(info.run)

program.command('login')
  .description('Sign in and save session')
  .requiredOption('-e, --email <string>', 'account email')
  .requiredOption('-p, --password <string>', 'account password')
  .action(login.run)

program.command('show-collections')
  .description('List your collections and sharable collections')
  .action(showCollections.run)

program.command('show-collection-tokens')
  .description('List tokens for a collection or sharable collection by id')
  .requiredOption('-i, --id <string>', 'collection id (24 hex) or sharable public id (digits)')
  .action(showCollectionTokens.run)

program.parseAsync(process.argv)
