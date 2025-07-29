/**
 * Integration tests for Easee Configuration Node
 * Tests the complete authentication flow with mocked API responses
 */

const {
  createMockRED,
  createMockEaseeNode,
  mockFetchResponses,
  verifyNodeStatus,
  verifyNodeEmit,
  mockData
} = require("../mocks/nodeRedMocks");

describe("Easee Configuration - Integration Tests", () => {
  let _mockRED;
  let node;

  beforeEach(() => {
    jest.useFakeTimers();

    // Completely reset all mocks
    jest.clearAllMocks();
    jest.resetAllMocks();
    global.fetch.mockClear();
    global.fetch.mockReset();

    _mockRED = createMockRED();
    node = createMockEaseeNode();

    // Reset all mocks before each test
    jest.clearAllMocks();
    global.fetch.mockClear();

    // Add all authentication methods
    node.doLogin = async function(_username, _password) {
      // Credential validation (same as the real implementation)
      if (!_username && !this.username) {
        const error = new Error("No username provided for login");
        console.error("Login failed: No username configured");
        this.status({
          fill: "red",
          shape: "ring",
          text: "No username configured"
        });
        throw error;
      }

      if (!_password && !this.credentials.password) {
        const error = new Error("No password provided for login");
        console.error("Login failed: No password configured");
        this.status({
          fill: "red",
          shape: "ring",
          text: "No password configured"
        });
        throw error;
      }

      // Simplified login implementation for integration testing
      const response = await fetch(this.RestApipath + "/accounts/login", {
        method: "post",
        body: JSON.stringify({
          userName: _username ?? this.username,
          password: _password ?? this.credentials.password
        }),
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(`Login failed (${response.status})`);
      }

      if ("accessToken" in json) {
        this.accessToken = json.accessToken;
        this.refreshToken = json.refreshToken;
        const t = new Date();
        t.setSeconds(t.getSeconds() + json.expiresIn);
        this.tokenExpires = t;

        this.refreshRetryCount = 0;
        this.loginRetryCount = 0;

        this.status({
          fill: "green",
          shape: "dot",
          text: "Authenticated"
        });

        this.emit("update", {
          update: "Login successful, token retrieved"
        });

        return json;
      } else {
        throw new Error("Login response did not contain access token");
      }
    };

    node.doRefreshToken = async function() {
      if (!this.accessToken || !this.refreshToken) {
        console.log("No tokens available for refresh, attempting fresh login");
        try {
          await this.doLogin();
          return;
        } catch (loginError) {
          console.error("Login failed during refresh:", loginError);
          this.status({
            fill: "red",
            shape: "ring",
            text: "Authentication failed"
          });
          return null;
        }
      }

      try {
        const response = await fetch(this.RestApipath + "/accounts/refresh_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/*+json"
          },
          body: JSON.stringify({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken
          })
        });

        const json = await response.json();

        if (!response.ok) {
          if (response.status === 401) {
            // Token is invalid - clear tokens and return null to indicate fresh login needed
            console.log("Refresh token invalid, clearing tokens and will attempt fresh login");
            this.accessToken = false;
            this.refreshToken = false;
            this.tokenExpires = new Date();
            this.refreshRetryCount = 0;

            this.emit("update", {
              update: "Token refresh failed, will attempt fresh login"
            });

            return null; // Return null to indicate we should try fresh login
          }
          throw new Error(`Token refresh failed (${response.status})`);
        }

        if (!json.accessToken) {
          console.log("doRefreshToken error(): ", json);
          return null;
        }

        // Successful refresh - reset retry counter
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
      } catch (error) {
        // Handle network errors and retries
        const isTokenInvalid = error.message.includes("Invalid refresh token") ||
                               error.message.includes("Token refresh failed") ||
                               error.message.includes("401");

        const isNetworkError = error.message.includes("fetch") ||
                               error.message.includes("network") ||
                               error.message.includes("timeout");

        if (isTokenInvalid) {
          // Token is invalid - clear tokens and request fresh login
          console.log("Refresh token invalid, clearing tokens and will attempt fresh login");
          this.accessToken = false;
          this.refreshToken = false;
          this.tokenExpires = new Date();
          this.refreshRetryCount = 0;

          this.emit("update", {
            update: "Token refresh failed, will attempt fresh login"
          });

          return null; // Return null to indicate we should try fresh login
        } else if (isNetworkError && this.refreshRetryCount < this.maxRefreshRetries) {
          // Network error - increment retry count and return null to trigger fresh login
          this.refreshRetryCount++;
          console.log(`Network error during token refresh, retry ${this.refreshRetryCount}/${this.maxRefreshRetries}`);

          this.emit("update", {
            update: `Token refresh retry ${this.refreshRetryCount}/${this.maxRefreshRetries}`
          });

          return null; // Return null to trigger fresh login attempt
        } else {
          // Max retries reached or other error
          console.error("Token refresh failed after retries or due to other error:", error);
          this.refreshRetryCount++;

          if (this.refreshRetryCount >= this.maxRefreshRetries) {
            console.log("Max refresh retries reached, clearing tokens and attempting fresh login");
            this.accessToken = false;
            this.refreshToken = false;
            this.tokenExpires = new Date();
            this.refreshRetryCount = 0;

            this.emit("update", {
              update: "Token refresh failed after retries, attempting fresh login"
            });

            return null; // Return null to indicate we should try fresh login
          } else {
            this.emit("update", {
              update: `Token refresh failed, retry ${this.refreshRetryCount}/${this.maxRefreshRetries}`
            });
            return null;
          }
        }
      }
    };

    node.resetAuthenticationState = function() {
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

    node.checkToken = async function() {
      if (!this.credentials || (!this.credentials.username && !this.credentials.password)) {
        this.status({
          fill: "yellow",
          shape: "ring",
          text: "No credentials configured"
        });
        return;
      }

      const expiresIn = Math.floor(((this?.tokenExpires ?? 0) - new Date()) / 1000);
      if (expiresIn < 43200) { // Less than 12 hours
        this.status({
          fill: "yellow",
          shape: "ring",
          text: "Refreshing token..."
        });

        const refreshResult = await this.doRefreshToken();

        // If refresh failed (returned null), try fresh login
        if (refreshResult === null) {
          this.status({
            fill: "yellow",
            shape: "ring",
            text: "Token expired, re-authenticating..."
          });

          try {
            await this.doLogin();
            // Reset retry counters on successful login
            this.refreshRetryCount = 0;
            this.loginRetryCount = 0;
          } catch (loginError) {
            console.error("Fresh login also failed:", loginError);
            this.loginRetryCount++;

            if (this.loginRetryCount >= this.maxLoginRetries) {
              this.status({
                fill: "red",
                shape: "ring",
                text: "Authentication failed - check credentials"
              });

              // Clear all tokens to force reconfiguration
              this.accessToken = false;
              this.refreshToken = false;
              this.tokenExpires = new Date();
              this.refreshRetryCount = 0;
              this.loginRetryCount = 0;
              return;
            } else {
              this.status({
                fill: "yellow",
                shape: "ring",
                text: `Login retry ${this.loginRetryCount}/${this.maxLoginRetries}`
              });
            }
          }
        }
      }
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    if (node.checkTokenHandler) {
      clearTimeout(node.checkTokenHandler);
    }
  });

  describe("Complete Authentication Flow", () => {
    test("should complete full login flow successfully", async() => {
      // Arrange
      mockFetchResponses.loginSuccess();

      // Act
      const result = await node.doLogin();

      // Assert
      expect(result).toEqual(mockData.loginSuccess);
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);
      expect(node.refreshToken).toBe(mockData.loginSuccess.refreshToken);

      verifyNodeStatus(node, {
        fill: "green",
        shape: "dot",
        text: "Authenticated"
      });

      verifyNodeEmit(node, "update", {
        update: "Login successful, token retrieved"
      });
    });

    test("should handle login failure and recover with valid credentials", async() => {
      // Arrange - first call fails, second succeeds
      global.fetch
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.loginErrors.invalidCredentials, 401)
        )
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
        );

      // Act - first login attempt should fail
      await expect(node.doLogin()).rejects.toThrow("Login failed (401)");

      // Second attempt should succeed
      const result = await node.doLogin();

      // Assert
      expect(result).toEqual(mockData.loginSuccess);
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);
    });

    test("should automatically refresh expired token", async() => {
      // Arrange - setup existing tokens
      node.accessToken = "existing-token";
      node.refreshToken = "existing-refresh";
      node.tokenExpires = new Date(Date.now() - 1000); // Expired 1 second ago

      mockFetchResponses.refreshSuccess();

      // Act
      await node.checkToken();

      // Assert
      expect(node.accessToken).toBe(mockData.refreshSuccess.accessToken);
      expect(node.refreshToken).toBe(mockData.refreshSuccess.refreshToken);

      verifyNodeEmit(node, "update", {
        update: "Token refreshed successfully"
      });
    });

    test("should fall back to login when refresh fails", async() => {
      // Arrange - setup for refresh failure, then login success
      node.accessToken = "invalid-token";
      node.refreshToken = "invalid-refresh";
      node.tokenExpires = new Date(Date.now() + (10 * 60 * 60 * 1000)); // Token expires in 10 hours (triggers refresh)

      // Ensure node has credentials for fallback login
      node.credentials = {
        username: "testuser@example.com",
        password: "testpass123"
      };

      global.fetch
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.refreshErrors.invalidRefreshToken, 401)
        )
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
        );

      // Act
      await node.checkToken();

      // Assert - should have fallen back to login successfully
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);
      expect(node.refreshToken).toBe(mockData.loginSuccess.refreshToken);

      verifyNodeStatus(node, {
        fill: "green",
        shape: "dot",
        text: "Authenticated"
      });
    });

    test("should handle complete authentication flow from start to renewal", async() => {
      // Arrange - mock successful login followed by successful refresh
      global.fetch.mockClear(); // Clear any previous mocks
      global.fetch
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
        )
        .mockResolvedValueOnce(
          global.testHelpers.createFetchResponse(mockData.refreshSuccess, 200)
        );

      // Act - Initial login
      await node.doLogin();

      // Verify login worked
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);

      // Simulate token will expire within the next 10 hours (less than 12 hour threshold)
      node.tokenExpires = new Date(Date.now() + (10 * 60 * 60 * 1000)); // 10 hours left

      // Check token (should trigger refresh since < 12 hours)
      await node.checkToken();

      // Assert
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(node.accessToken).toBe(mockData.refreshSuccess.accessToken);
      expect(node.refreshToken).toBe(mockData.refreshSuccess.refreshToken);
    });

    test("should handle network errors with proper fallback", async() => {
      // Arrange - network error on first attempt, success on retry
      global.fetch.mockClear(); // Clear any previous mocks

      // First call fails with network error
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      // Act - first attempt fails
      await expect(node.doLogin()).rejects.toThrow("Network error");

      // Setup second call to succeed
      global.fetch.mockResolvedValueOnce(
        global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
      );

      // Second attempt succeeds
      const result = await node.doLogin();

      // Assert
      expect(result).toEqual(mockData.loginSuccess);
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);
    });
  });

  describe("Error Recovery Scenarios", () => {
    test("should recover from temporary network issues", async() => {
      // Arrange
      node.accessToken = "valid-token";
      node.refreshToken = "valid-refresh";
      node.tokenExpires = new Date(Date.now() + (6 * 60 * 60 * 1000)); // 6 hours

      global.fetch.mockClear(); // Clear any previous mocks

      // First refresh fails with network error
      global.fetch.mockRejectedValueOnce(new Error("fetch failed - timeout"));

      // Act - first attempt should return null due to network error
      const firstResult = await node.doRefreshToken();
      expect(firstResult).toBe(null);

      // Setup second call to succeed
      global.fetch.mockResolvedValueOnce(
        global.testHelpers.createFetchResponse(mockData.refreshSuccess, 200)
      );

      // Second attempt should succeed
      const result = await node.doRefreshToken();

      // Assert
      expect(result).toEqual(mockData.refreshSuccess);
    });

    test("should reset authentication after multiple failures", async() => {
      // Arrange
      node.accessToken = "invalid-token";
      node.refreshToken = "invalid-refresh";
      node.maxRefreshRetries = 1;
      node.refreshRetryCount = 1; // Already at max, so next failure should reset

      global.fetch.mockClear(); // Clear any previous mocks
      global.fetch.mockRejectedValueOnce(new Error("fetch failed - timeout"));

      // Act
      const result = await node.doRefreshToken();

      // Assert - should return null and reset authentication after max retries
      expect(result).toBe(null);
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);
      expect(node.refreshRetryCount).toBe(0);
    });
  });

  describe("Configuration Edge Cases", () => {
    test("should handle missing credentials gracefully", async() => {
      // Arrange
      node.credentials = null;

      // Act
      await node.checkToken();

      // Assert
      verifyNodeStatus(node, {
        fill: "yellow",
        shape: "ring",
        text: "No credentials configured"
      });
    });

    test("should handle empty credentials", async() => {
      // Arrange
      node.credentials = { username: "", password: "" };

      // Act
      await node.checkToken();

      // Assert
      verifyNodeStatus(node, {
        fill: "yellow",
        shape: "ring",
        text: "No credentials configured"
      });
    });

    test("should handle partial credentials", async() => {
      // Arrange
      node.credentials = { username: "test@example.com", password: "" };
      global.fetch.mockClear(); // Clear any previous mocks

      // Since validation should happen before fetch, no mock needed
      // Act & Assert
      await expect(node.doLogin()).rejects.toThrow("No password provided for login");
    });
  });

  describe("Token Lifecycle Management", () => {
    test("should manage token lifecycle correctly", async() => {
      // Arrange - start with no tokens
      expect(node.accessToken).toBeNull();
      expect(node.refreshToken).toBeNull();

      global.fetch.mockClear(); // Clear any previous mocks

      // Mock successful login
      global.fetch.mockResolvedValueOnce(
        global.testHelpers.createFetchResponse(mockData.loginSuccess, 200)
      );

      // Act - Login
      await node.doLogin();
      expect(node.accessToken).toBe(mockData.loginSuccess.accessToken);

      // Mock successful refresh
      global.fetch.mockResolvedValueOnce(
        global.testHelpers.createFetchResponse(mockData.refreshSuccess, 200)
      );

      // Refresh token
      await node.doRefreshToken();
      expect(node.accessToken).toBe(mockData.refreshSuccess.accessToken);

      // Reset authentication
      node.resetAuthenticationState();
      expect(node.accessToken).toBe(false);
      expect(node.refreshToken).toBe(false);

      // Assert final state
      verifyNodeStatus(node, {
        fill: "red",
        shape: "ring",
        text: "Authentication reset - reconfiguration required"
      });
    });
  });
});
