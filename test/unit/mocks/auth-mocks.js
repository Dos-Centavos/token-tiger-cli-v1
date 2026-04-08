/*
  Mock auth API responses for login unit tests.
*/

export const mockAuthSuccessResponse = {
  data: {
    token: 'mock-jwt-token',
    user: {
      _id: 'user-id-1',
      email: 'user@test.com',
      projects: ['proj-a']
    }
  }
}
