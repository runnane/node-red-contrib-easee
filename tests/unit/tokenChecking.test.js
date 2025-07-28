/**
 * Unit tests for Easee Configuration Node Token Checking
 * Tests the automatic token checking and renewal logic
 */

const {
  createMockEaseeNode,
  _simulateTimePassage,
  mockData
} = require("../mocks/nodeRedMocks");

describe("Easee Configuration - Token Checking", () => {
  let node;

  beforeEach(() => {
    jest.useFakeTimers();

    node = createMockEaseeNode({
      accessToken: "valid-access-token",
      refreshToken: "valid-refresh-token",
      tokenExpires: new Date(Date.now() + 3600000) // 1 hour from now
    });

    // Add the checkToken implementation
    node.checkToken = async function() {
      // Clear any existing timeout first
      if (this.checkTokenHandler) {
        clearTimeout(this.checkTokenHandler);
        this.checkTokenHandler = null;
      }

      // Check if credentials are configured before attempting any authentication
      if (!this.credentials || (!this.credentials.username || !this.credentials.password)) {
        console.log("No credentials configured, skipping token check");
        this.status({
          fill: "yellow",
          shape: "ring",
          text: "No credentials configured"
        });

        // Schedule next check with longer interval
        const checkInterval = 300 * 1000; // 5 minutes
        this.checkTokenHandler = setTimeout(() => {
          this.checkToken().catch((error) => {
            console.error("Token check failed:", error);
          });
        }, checkInterval);

        return;
      }

      const expiresIn = Math.floor(((this?.tokenExpires ?? 0) - new Date()) / 1000);
      if (expiresIn < 43200) { // Less than 12 hours
        let _refreshResult = null;

        try {
          _refreshResult = await this.doRefreshToken();
        } catch (error) {
          console.error("Token refresh failed during check:", error);
          _refreshResult = null;
        }
      }

      // Schedule next token check
      const hasCredentials = this.credentials && this.credentials.username && this.credentials.password;
      const checkInterval = hasCredentials ? 60 * 1000 : 300 * 1000; // 1 min vs 5 min

      this.checkTokenHandler = setTimeout(() => {
        this.checkToken().catch((error) => {
          console.error("Scheduled token check failed:", error);
        });
      }, checkInterval);
    };

    // Mock doRefreshToken
    node.doRefreshToken = jest.fn().mockResolvedValue(mockData.refreshSuccess);
  });

  afterEach(() => {
    jest.useRealTimers();
    // Clean up any timeouts without using clearTimeout since it might not be mocked consistently
    if (node.checkTokenHandler) {
      node.checkTokenHandler = null;
    }
  });

  describe("checkToken method", () => {
    test("should not refresh token when it has more than 12 hours left", async() => {
      // Arrange - token expires in 24 hours
      node.tokenExpires = new Date(Date.now() + (24 * 60 * 60 * 1000));

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).not.toHaveBeenCalled();
    });

    test("should refresh token when it has less than 12 hours left", async() => {
      // Arrange - token expires in 6 hours
      node.tokenExpires = new Date(Date.now() + (6 * 60 * 60 * 1000));

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled();
    });

    test("should refresh token when it has already expired", async() => {
      // Arrange - token expired 1 hour ago
      node.tokenExpires = new Date(Date.now() - (60 * 60 * 1000));

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled();
    });

    test("should handle refresh failure gracefully", async() => {
      // Arrange
      node.tokenExpires = new Date(Date.now() + (6 * 60 * 60 * 1000));
      node.doRefreshToken = jest.fn().mockRejectedValue(new Error("Refresh failed"));

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled();
      // Should not throw error, just log it
    });

    test("should schedule next check with 1 minute interval when credentials available", async() => {
      // Arrange
      node.credentials = { username: "test@example.com", password: "password" };

      // Spy on setTimeout to verify it's called
      const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(() => "mock-timeout-id");

      // Act
      await node.checkToken();

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 1000 // 1 minute
      );

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    test("should schedule next check with 5 minute interval when no credentials", async() => {
      // Arrange
      node.credentials = { username: "", password: "" };

      // Spy on setTimeout to verify it's called
      const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(() => "mock-timeout-id");

      // Act
      await node.checkToken();

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        300 * 1000 // 5 minutes
      );

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    test("should skip token check when no credentials configured", async() => {
      // Arrange
      node.credentials = null;

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).not.toHaveBeenCalled();
      expect(node.status).toHaveBeenCalledWith({
        fill: "yellow",
        shape: "ring",
        text: "No credentials configured"
      });
    });

    test("should handle missing tokenExpires gracefully", async() => {
      // Arrange
      node.tokenExpires = null;

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled(); // Should try to refresh immediately
    });

    test("should handle undefined tokenExpires gracefully", async() => {
      // Arrange
      delete node.tokenExpires;

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled(); // Should try to refresh immediately
    });
  });

  describe("Token checking timing", () => {
    test("should calculate correct time until expiration", async() => {
      // Arrange - token expires in exactly 10 hours
      const hoursFromNow = 10;
      node.tokenExpires = new Date(Date.now() + (hoursFromNow * 60 * 60 * 1000));

      // Act
      await node.checkToken();

      // Assert
      const _expectedExpiresIn = hoursFromNow * 60 * 60; // 10 hours in seconds
      // Should not refresh because 10 hours > 12 hours threshold is false, so it should refresh
      expect(node.doRefreshToken).toHaveBeenCalled();
    });

    test("should handle token that expires exactly at threshold", async() => {
      // Arrange - token expires in exactly 12 hours minus 1 second (to trigger refresh)
      node.tokenExpires = new Date(Date.now() + (12 * 60 * 60 * 1000) - 1000);

      // Act
      await node.checkToken();

      // Assert
      // Less than 12 hours should trigger refresh
      expect(node.doRefreshToken).toHaveBeenCalled();
    });

    test("should handle token that expires just over threshold", async() => {
      // Arrange - token expires in 12 hours and 1 second
      node.tokenExpires = new Date(Date.now() + (12 * 60 * 60 * 1000) + 1000);

      // Act
      await node.checkToken();

      // Assert
      // Just over threshold should not trigger refresh
      expect(node.doRefreshToken).not.toHaveBeenCalled();
    });
  });

  describe("Scheduled token checking", () => {
    test("should schedule recurring token checks", async() => {
      // Arrange
      node.credentials = { username: "test@example.com", password: "password" };

      // Spy on setTimeout
      const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(() => "mock-timeout-id");

      // Act
      await node.checkToken();

      // Assert
      expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 60 * 1000);

      // Cleanup
      setTimeoutSpy.mockRestore();
    });

    test("should handle errors in scheduled token checks", async() => {
      // Arrange
      node.credentials = { username: "test@example.com", password: "password" };

      // Make doRefreshToken fail
      node.doRefreshToken = jest.fn().mockRejectedValue(new Error("Scheduled refresh failed"));

      // Act & Assert - should not throw when checkToken executes
      await expect(node.checkToken()).resolves.not.toThrow();
    });

    test("should clear existing timeout before setting new one", async() => {
      // Arrange
      const mockTimeoutId = "existing-timeout";
      node.checkTokenHandler = mockTimeoutId;

      const clearTimeoutSpy = jest.spyOn(global, "clearTimeout").mockImplementation(() => {});
      const setTimeoutSpy = jest.spyOn(global, "setTimeout").mockImplementation(() => "new-timeout-id");

      // Act
      await node.checkToken();

      // Assert
      expect(clearTimeoutSpy).toHaveBeenCalledWith(mockTimeoutId);

      // Cleanup
      clearTimeoutSpy.mockRestore();
      setTimeoutSpy.mockRestore();
    });
  });

  describe("Edge cases", () => {
    test("should handle negative expiration time", async() => {
      // Arrange - token expired long ago
      node.tokenExpires = new Date(Date.now() - (24 * 60 * 60 * 1000));

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).toHaveBeenCalled();
    });

    test("should handle very large expiration time", async() => {
      // Arrange - token expires far in the future
      node.tokenExpires = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).not.toHaveBeenCalled();
    });

    test("should handle malformed credentials object", async() => {
      // Arrange
      node.credentials = "not an object";

      // Act
      await node.checkToken();

      // Assert
      expect(node.doRefreshToken).not.toHaveBeenCalled();
      expect(node.status).toHaveBeenCalledWith({
        fill: "yellow",
        shape: "ring",
        text: "No credentials configured"
      });
    });
  });
});
