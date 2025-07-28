/**
 * Unit tests for Easee Configuration Node Token Refresh
 * Tests the token refresh methods with mocked API responses
 */

const {
  createMockEaseeNode,
  mockFetchResponses,
  verifyFetchCall,
  verifyNodeStatus,
  verifyNodeEmit,
  mockData
} = require("../mocks/nodeRedMocks");

describe("Easee Configuration - Token Refresh", () => {
  let node;

  beforeEach(() => {
    node = createMockEaseeNode({
      accessToken: "existing-access-token",
      refreshToken: "existing-refresh-token",
      tokenExpires: new Date(Date.now() + 3600000) // 1 hour from now
    });

    // Add the doRefreshToken implementation
    node.doRefreshToken = async function() {
      if (!this.accessToken || !this.refreshToken) {
        console.log("No tokens available for refresh, attempting fresh login");
        try {
          return await this.doLogin();
        } catch (loginError) {
          throw new Error("Failed to refresh token and login failed: " + loginError.message);
        }
      }

      const response = await fetch(
        this.RestApipath + "/accounts/refresh_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/*+json"
          },
          body: JSON.stringify({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken
          })
        }
      )
        .then(async(response) => {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.indexOf("application/json") !== -1) {
            const json = await response.json();

            if (!response.ok) {
              const errorMsg = json.title || json.errorCodeName || "Token refresh failed";
              const errorDetail = json.detail || "";
              throw new Error(`Token refresh failed (${response.status}): ${errorMsg}${errorDetail ? " - " + errorDetail : ""}`);
            }

            return json;
          } else {
            const errortxt = await response.text();
            throw new Error("Unable to refresh token, response not JSON: " + errortxt);
          }
        })
        .then((json) => {
          if (!json.accessToken) {
            throw new Error("Token refresh response did not contain access token");
          }

          this.refreshRetryCount = 0;
          this.accessToken = json.accessToken;
          this.refreshToken = json.refreshToken;
          const t = new Date();
          t.setSeconds(t.getSeconds() + json.expiresIn);
          this.tokenExpires = t;

          this.emit("update", {
            update: "Token refreshed successfully"
          });

          return json;
        }).catch((error) => {
          const isTokenInvalid = error.message.includes("Invalid refresh token") ||
                                 error.message.includes("Token refresh failed") ||
                                 error.message.includes("401");

          const isNetworkError = error.message.includes("fetch") ||
                                 error.message.includes("network") ||
                                 error.message.includes("timeout");

          if (isTokenInvalid) {
            console.log("Refresh token is invalid, attempting fresh login");
            this.resetAuthenticationState();
            throw new Error("Refresh token invalid - authentication reset required");
          } else if (isNetworkError && this.refreshRetryCount < this.maxRefreshRetries) {
            this.refreshRetryCount++;
            console.log(`Network error during token refresh, retry ${this.refreshRetryCount}/${this.maxRefreshRetries}`);
            throw new Error(`Network error during token refresh (attempt ${this.refreshRetryCount})`);
          } else {
            console.error("Token refresh failed after all retries:", error.message);
            this.resetAuthenticationState();
            throw error;
          }
        });

      return response;
    };

    // Add resetAuthenticationState implementation
    node.resetAuthenticationState = function() {
      console.log("Resetting authentication state");
      this.accessToken = false;
      this.refreshToken = false;
      this.tokenExpires = new Date();
      this.refreshRetryCount = 0;
      this.loginRetryCount = 0;

      this.status({
        fill: "red",
        shape: "ring",
        text: "Authentication reset - reconfiguration required"
      });

      this.emit("update", {
        update: "Authentication failed - node requires reconfiguration"
      });
    };
  });

  describe("doRefreshToken method", () => {
    test("should successfully refresh token with valid refresh token", async() => {
      // Arrange
      mockFetchResponses.refreshSuccess();

      // Act
      const result = await node.doRefreshToken();

      // Assert
      expect(result).toEqual(mockData.refreshSuccess);
      expect(node.accessToken).toBe(mockData.refreshSuccess.accessToken);
      expect(node.refreshToken).toBe(mockData.refreshSuccess.refreshToken);
      expect(node.refreshRetryCount).toBe(0);

      verifyFetchCall(
        `${mockData.apiEndpoints.baseUrl}/accounts/refresh_token`,
        {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/*+json"
          }
        }
      );

      verifyNodeEmit(node, "update", {
        update: "Token refreshed successfully"
      });
    });

    test("should handle invalid refresh token error", async() => {
      // Arrange
      mockFetchResponses.refreshFailure("invalidRefreshToken");

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Refresh token invalid - authentication reset required");

      // Verify authentication state was reset
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.refreshRetryCount).toBe(0);
      expect(node.loginRetryCount).toBe(0);
    });

    test("should handle expired refresh token", async() => {
      // Arrange
      mockFetchResponses.refreshFailure("expiredRefreshToken");

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Refresh token invalid - authentication reset required");

      // Verify resetAuthenticationState was called
      verifyNodeStatus(node, {
        fill: "red",
        shape: "ring",
        text: "Authentication reset - reconfiguration required"
      });
    });

    test("should retry on network errors up to max retries", async() => {
      // Arrange
      node.maxRefreshRetries = 2;
      node.refreshRetryCount = 0;
      mockFetchResponses.networkError("timeout");

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Network error during token refresh (attempt 1)");
      expect(node.refreshRetryCount).toBe(1);
    });

    test("should reset authentication after max network retries", async() => {
      // Arrange
      node.maxRefreshRetries = 1;
      node.refreshRetryCount = 1; // Already at max retries
      mockFetchResponses.networkError("connectionRefused");

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("fetch failed - connection refused");

      // Verify authentication was reset
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
    });

    test("should attempt login when no tokens available", async() => {
      // Arrange
      node.accessToken = null;
      node.refreshToken = null;

      // Mock successful login
      node.doLogin = jest.fn().mockResolvedValue(mockData.loginSuccess);

      // Act
      const result = await node.doRefreshToken();

      // Assert
      expect(node.doLogin).toHaveBeenCalled();
      expect(result).toEqual(mockData.loginSuccess);
    });

    test("should handle login failure when no tokens available", async() => {
      // Arrange
      node.accessToken = null;
      node.refreshToken = null;

      const loginError = new Error("Login failed");
      node.doLogin = jest.fn().mockRejectedValue(loginError);

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Failed to refresh token and login failed: Login failed");
    });

    test("should handle non-JSON response during refresh", async() => {
      // Arrange
      mockFetchResponses.nonJsonResponse();

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Unable to refresh token, response not JSON");
    });

    test("should handle refresh response without access token", async() => {
      // Arrange
      global.fetch.mockResolvedValueOnce(
        global.testHelpers.createFetchResponse({ someOtherField: "value" }, 200)
      );

      // Act & Assert
      await expect(node.doRefreshToken()).rejects.toThrow("Token refresh response did not contain access token");
    });

    test("should correctly update token expiration time on refresh", async() => {
      // Arrange
      const beforeRefresh = new Date();
      mockFetchResponses.refreshSuccess();

      // Act
      await node.doRefreshToken();

      // Assert
      const expectedExpiration = new Date(beforeRefresh.getTime() + (mockData.refreshSuccess.expiresIn * 1000));
      const actualExpiration = node.tokenExpires;

      // Allow for small timing differences (within 1 second)
      expect(Math.abs(actualExpiration - expectedExpiration)).toBeLessThan(1000);
    });

    test("should include correct tokens in refresh request body", async() => {
      // Arrange
      const expectedAccessToken = "test-access-token";
      const expectedRefreshToken = "test-refresh-token";
      node.accessToken = expectedAccessToken;
      node.refreshToken = expectedRefreshToken;

      mockFetchResponses.refreshSuccess();

      // Act
      await node.doRefreshToken();

      // Assert
      const fetchCall = global.fetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1].body);

      expect(requestBody.accessToken).toBe(expectedAccessToken);
      expect(requestBody.refreshToken).toBe(expectedRefreshToken);
    });
  });

  describe("resetAuthenticationState method", () => {
    test("should reset all authentication state", () => {
      // Arrange
      node.accessToken = "some-token";
      node.refreshToken = "some-refresh-token";
      node.refreshRetryCount = 2;
      node.loginRetryCount = 1;

      // Act
      node.resetAuthenticationState();

      // Assert
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.refreshRetryCount).toBe(0);
      expect(node.loginRetryCount).toBe(0);
      expect(node.tokenExpires).toBeInstanceOf(Date);

      verifyNodeStatus(node, {
        fill: "red",
        shape: "ring",
        text: "Authentication reset - reconfiguration required"
      });

      verifyNodeEmit(node, "update", {
        update: "Authentication failed - node requires reconfiguration"
      });
    });
  });
});
