/**
 * MIT License
 * 
 * Copyright (c) 2025 Jon Tungland
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 * 
 * This project was initially forked from node-red-contrib-signalrcore
 * by Scott Page (Apache License 2.0).
 **/

module.exports = function (RED) {
  "use strict";
  
  // Import the modular Easee library
  const easee = require('../lib');
  const { API_CONFIG } = require('../lib/constants');

  function EaseeConfiguration(config) {
    RED.nodes.createNode(this, config);
    
    this.name = config.name;
    this.host = config.host || API_CONFIG.BASE_URL;
    this.signalRpath = config.signalRpath || API_CONFIG.SIGNALR_URL;
    this.debugLogging = config.debugLogging || false;
    this.nodeRedLogging = config.nodeRedLogging || false;

    // Create the Easee client using the modular library
    // Note: Don't create client immediately - wait for credentials to be available
    this._easeeClient = null;

    // Legacy properties for backward compatibility
    this._accessToken = null;
    this._refreshToken = null;
    this._tokenExpiresIn = null;
    this._accessTokenExpires = null;

    /**
     * Get or create the Easee client
     * @returns {Object} Easee client instance
     */
    this.getEaseeClient = () => {
      if (!this._easeeClient && this.credentials) {
        this._easeeClient = easee.createNodeRedClient(this, this.credentials, {
          baseUrl: this.host,
          signalRpath: this.signalRpath,
          debugLogging: this.debugLogging,
          nodeRedLogging: this.nodeRedLogging
        });
      }
      return this._easeeClient;
    };

    // Expose easeeClient as a property for backward compatibility
    Object.defineProperty(this, 'easeeClient', {
      get: function() {
        return this.getEaseeClient();
      }
    });

    // Expose accessToken as a property for backward compatibility
    Object.defineProperty(this, 'accessToken', {
      get: function() {
        const client = this.getEaseeClient();
        if (client && client.auth && client.auth.isAuthenticated()) {
          return client.auth.getAccessToken();
        }
        return this._accessToken;
      },
      set: function(value) {
        this._accessToken = value;
      }
    });

    /**
     * Validate credentials - wrapper around modular implementation
     * @returns {Object} validation result
     */
    this.validateCredentials = () => {
      try {
        // Use current credentials from the node
        const credentials = this.credentials;
        return easee.auth.validateCredentials(credentials);
      } catch (error) {
        return {
          valid: false,
          message: error.message
        };
      }
    };

    /**
     * Legacy method for backward compatibility
     * @returns {boolean}
     */
    this.isConfigurationValid = () => {
      const validation = this.validateCredentials();
      return validation.valid;
    };

    /**
     * Ensure authentication - wrapper around modular implementation
     * @returns {Promise<boolean>}
     */
    this.ensureAuthentication = async () => {
      try {
        const client = this.getEaseeClient();
        if (!client) {
          return false;
        }
        
        const result = await client.auth.ensureAuthenticated();
        
        // Update legacy properties for backward compatibility
        if (result.success && result.tokens) {
          this._accessToken = result.tokens.accessToken;
          this._refreshToken = result.tokens.refreshToken;
          this._tokenExpiresIn = result.tokens.expiresIn;
          this._accessTokenExpires = result.tokens.accessTokenExpires;
        }
        
        return result.success;
      } catch (error) {
        const client = this.getEaseeClient();
        if (client) {
          client.logger.error('Authentication failed:', error);
        }
        return false;
      }
    };

    /**
     * Ensure authenticated - alias for backward compatibility
     * @returns {Promise<boolean>}
     */
    this.ensureAuthenticated = this.ensureAuthentication;

    /**
     * Login method - wrapper around modular implementation
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<Object>}
     */
    this.doLogin = async (username, password) => {
      try {
        const client = this.getEaseeClient();
        if (!client) {
          throw new Error('Client not available - check credentials');
        }
        
        const result = await client.auth.login(username, password);
        
        // Update legacy properties for backward compatibility
        if (result.success && result.tokens) {
          this._accessToken = result.tokens.accessToken;
          this._refreshToken = result.tokens.refreshToken;
          this._tokenExpiresIn = result.tokens.expiresIn;
          this._accessTokenExpires = result.tokens.accessTokenExpires;
        }
        
        return result;
      } catch (error) {
        throw error;
      }
    };

    /**
     * Parse observation data - wrapper around modular implementation
     * @param {Object} data 
     * @returns {Object}
     */
    this.parseObservation = (data) => {
      const client = this.getEaseeClient();
      if (!client) {
        // Fallback to direct parsing if client not available
        return easee.api.parseObservation(data);
      }
      return client.parser.parseObservation(data);
    };

    /**
     * Legacy logging methods for backward compatibility
     */
    this.logInfo = (message, data) => {
      const client = this.getEaseeClient();
      if (client) {
        client.logger.info(message, data);
      } else {
        console.log(`[easee] ${message}`, data || '');
      }
    };

    this.logDebug = (message, data) => {
      const client = this.getEaseeClient();
      if (client) {
        client.logger.debug(message, data);
      } else if (this.debugLogging) {
        console.log(`[easee] DEBUG: ${message}`, data || '');
      }
    };

    this.logError = (message, error) => {
      const client = this.getEaseeClient();
      if (client) {
        client.logger.error(message, error);
      } else {
        console.error(`[easee] ERROR: ${message}`, error || '');
      }
    };

    this.logWarn = (message, data) => {
      const client = this.getEaseeClient();
      if (client) {
        client.logger.warn(message, data);
      } else {
        console.warn(`[easee] WARN: ${message}`, data || '');
      }
    };

    // Initialize authentication on startup
    this.on('ready', () => {
      if (this.validateCredentials().valid) {
        this.ensureAuthentication().catch(error => {
          const client = this.getEaseeClient();
          if (client) {
            client.logger.error('Initial authentication failed:', error);
          }
        });
      }
    });

    // Handle node close
    this.on('close', (removed, done) => {
      if (this._easeeClient && this._easeeClient.cleanup) {
        this._easeeClient.cleanup();
      }
      if (done) done();
    });

    // Initialize the client if credentials are available
    const client = this.getEaseeClient();
    if (client) {
      client.logger.info('Configuration node initialized');
    }
  }

  // Register the node type
  RED.nodes.registerType("easee-configuration", EaseeConfiguration, {
    credentials: {
      username: { type: "text" },
      password: { type: "password" }
    }
  });
};
