/*
  Mock session / user data for command unit tests (replaces data from user-data files).
*/

export const mockSessionWithJwtAndEmail = {
  JWT: 't',
  user: { email: 'a@example.com' },
  projects: []
}

export const mockSessionJwtNoEmail = {
  JWT: 't',
  user: { _id: 'x' },
  projects: []
}

export const mockSessionNoJwt = {
  user: { email: 'a@example.com' },
  projects: []
}

export const mockSessionCheckBalance = {
  JWT: 'test-jwt',
  user: { _id: 'user-id-1' },
  projects: []
}

export const mockSessionCheckBalanceNoJwt = {
  user: { _id: 'x' },
  projects: []
}

export const mockSessionCheckBalanceAxiosError = {
  JWT: 'j',
  user: { _id: 'u' },
  projects: []
}
