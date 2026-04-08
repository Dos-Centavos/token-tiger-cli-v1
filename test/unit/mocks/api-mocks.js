/*
  Mock API payloads and errors for command unit tests (replaces axios responses).
*/

export const mockUserWithCredit = {
  user: {
    credit: { available: 100 }
  }
}

export const mockAxiosUnauthorizedError = {
  response: { data: { error: 'Unauthorized' } }
}
