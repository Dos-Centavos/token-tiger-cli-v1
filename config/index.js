/*
  Configure Token Tiger CLI (env-driven defaults).
*/

// Load environment variables from .env file
import 'dotenv/config'

const config = {
  apiBaseUrl: process.env.TOKEN_TIGER_API_BASE_URL || 'http://localhost:5001',
  defaultToken: process.env.TOKEN_TIGER_TOKEN || '',
  logLevel: process.env.TOKEN_TIGER_LOG_LEVEL || 'info'
}

export default config
