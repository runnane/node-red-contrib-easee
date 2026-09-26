/**
 * Synthetic Easee API error bodies, in the problem-details shape (`title` /
 * `detail` / `errorCodeName`) doLogin() and doRefreshToken() parse. Fed to the
 * real configuration node by tests/integration/configuration-auth.test.ts;
 * expected messages are pinned literally there, not derived from here.
 */

const mockData = {
  // Login error responses
  loginErrors: {
    invalidCredentials: {
      title: "Unauthorized",
      status: 401,
      detail: "Invalid username or password",
      errorCodeName: "INVALID_CREDENTIALS",
    },
    serverError: {
      title: "Internal Server Error",
      status: 500,
      detail: "An unexpected error occurred",
    },
  },

  // Token refresh error responses
  refreshErrors: {
    invalidRefreshToken: {
      title: "Unauthorized",
      status: 401,
      detail: "Invalid refresh token",
      errorCodeName: "INVALID_REFRESH_TOKEN",
    },
  },
};

export default mockData;
