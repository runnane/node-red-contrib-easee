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
    // Deliberately no title/detail: a 5xx from the Easee API is often this
    // bare, and doRefreshToken()'s error-message fallbacks (errorCodeName,
    // then "Unknown error"/"" ) were otherwise never exercised.
    serverError: {
      status: 503,
      errorCodeName: "SERVICE_UNAVAILABLE",
    },
  },
};

export default mockData;
