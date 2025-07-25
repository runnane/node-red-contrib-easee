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

  // Import REST client utilities
  const { processMessageForRestApi } = require('../lib/utils/rest-client');

  function EaseeRestClient(config) {
    RED.nodes.createNode(this, config);

    // Store configuration
    this.charger = config.charger;
    this.site = config.site;
    this.circuit = config.circuit;
    this.configurationNode = config.configuration;
    this.connection = RED.nodes.getNode(this.configurationNode);

    if (!this.connection) {
      this.error("[easee] Missing easee configuration node");
      this.status({
        fill: "red",
        shape: "ring",
        text: "Missing configuration",
      });
      return;
    }

    // Get the Easee client from the configuration node
    const easeeClient = this.connection.easeeClient;
    if (!easeeClient) {
      this.error("[easee] Configuration node not properly initialized");
      this.status({
        fill: "red",
        shape: "ring",
        text: "Configuration not initialized",
      });
      return;
    }

    // Check if credentials are valid
    try {
      const validation = this.connection.validateCredentials();
      if (!validation.valid) {
        this.error(`[easee] Configuration node is invalid: ${validation.message}`);
        this.status({
          fill: "red",
          shape: "ring",
          text: "Invalid configuration",
        });
        return;
      }
    } catch (error) {
      this.error(`[easee] Error validating configuration: ${error.message}`);
      this.status({
        fill: "red",
        shape: "ring",
        text: "Configuration error",
      });
      return;
    }

    /**
     * Helper function for sending failure response
     * @param {string} url 
     * @param {string} method 
     * @param {*} error 
     */
    this.fail = async function (url, method, error) {
      easeeClient.logger.error(`REST Client Error: ${method} ${url}`, error);

      this.status({
        fill: "red",
        shape: "dot",
        text: `${method}: failed`,
      });

      this.send({
        status: "error",
        topic: `${method}: failed`,
        payload: null,
        error: error,
        url: url
      });
    };

    /**
     * Helper function for sending success response
     * @param {string} url 
     * @param {string} method 
     * @param {*} response 
     */
    this.ok = async function (url, method, response) {
      this.status({
        fill: "green",
        shape: "dot",
        text: `${method}: ok`,
      });

      this.send({
        status: "ok",
        topic: url,
        payload: response,
      });
    };    /**
     * Generic API request wrapper
     * @param {string} url - API endpoint URL
     * @param {string} method - HTTP method
     * @param {*} body - Request body (for POST/PUT)
     * @returns {Promise}
     */
    this.REQUEST = async function (url, method = "GET", body = null) {
      this.status({
        fill: "yellow",
        shape: "dot",
        text: `${method}: sending`,
      });

      try {
        // Ensure authentication before making request
        await this.connection.ensureAuthenticated();

        let response;
        const apiPath = url.startsWith('/') ? url : `/${url}`;

        switch (method.toUpperCase()) {
          case 'GET':
            response = await easeeClient.api.get(apiPath);
            break;
          case 'POST':
            response = await easeeClient.api.post(apiPath, body);
            break;
          case 'PUT':
            response = await easeeClient.api.put(apiPath, body);
            break;
          case 'DELETE':
            response = await easeeClient.api.delete(apiPath);
            break;
          default:
            throw new Error(`Unsupported HTTP method: ${method}`);
        }

        if (response.success) {
          await this.ok(url, method, response.data);
        } else {
          await this.fail(url, method, response.error || `HTTP ${response.statusCode}`);
        }
      } catch (error) {
        await this.fail(url, method, error.message);
      }
    };

    /**
     * REST API GET helper
     * @param {string} url 
     * @returns {Promise}
     */
    this.GET = async function (url) {
      return this.REQUEST(url, "GET");
    };

    /**
     * REST API POST helper
     * @param {string} url 
     * @param {*} body 
     * @returns {Promise}
     */
    this.POST = async function (url, body) {
      return this.REQUEST(url, "POST", body);
    };

    /**
     * REST API PUT helper
     * @param {string} url 
     * @param {*} body 
     * @returns {Promise}
     */
    this.PUT = async function (url, body) {
      return this.REQUEST(url, "PUT", body);
    };

    /**
     * REST API DELETE helper
     * @param {string} url 
     * @returns {Promise}
     */
    this.DELETE = async function (url) {
      return this.REQUEST(url, "DELETE");
    };

    // Handle incoming messages
    this.on("input", async function (msg, send, done) {
      // Process message using utility functions
      const request = processMessageForRestApi(msg, {
        charger: this.charger,
        site: this.site,
        circuit: this.circuit
      });

      easeeClient.logger.debug(`Processing message - Topic: ${msg.topic}`);
      easeeClient.logger.debug(`Request processing result: ${JSON.stringify(request, null, 2)}`);

      if (!request.success) {
        await this.fail("error", "GET", request.error);
        if (done) done();
        return;
      }

      // Update runtime parameters
      this.charger = request.params.charger || this.charger;
      this.site = request.params.site || this.site;
      this.circuit = request.params.circuit || this.circuit;

      // Handle special cases
      if (request.specialHandling === 'parse_observations') {
        easeeClient.logger.debug(`Taking special handling path: parse_observations`);
        // Handle charger_state with observation parsing
        try {
          await this.connection.ensureAuthenticated();
          const response = await easeeClient.api.get(request.path);

          // Extract the actual data from the response
          const json = response.success ? response.data : response;

          if (typeof json !== "object" || json === null) {
            this.error("charger_state failed - invalid response format");
            await this.fail(request.path, request.method, new Error("Invalid response format"));
            if (done) done();
            return;
          } else {
            // Parse observations using the same approach as the original implementation
            const parsedCount = Object.keys(json).length;
            easeeClient.logger.debug(`Processing ${parsedCount} charger state properties`);
            
            Object.keys(json).forEach((idx) => {
              const parsed = easeeClient.parser.parseObservation(
                {
                  dataName: idx,
                  value: json[idx],
                  origValue: json[idx],
                },
                "name"
              );
              
              // Only include observations that were successfully parsed (found in our definitions)
              if (parsed && parsed.observationId !== undefined) {
                // Fix the id field if it's unknown but we have observationId
                if (parsed.id === 'unknown' && parsed.observationId) {
                  parsed.id = parsed.observationId;
                }
                json[idx] = parsed;
              } else {
                // Keep unknown observations as-is without parsing to avoid debug noise
                json[idx] = {
                  dataName: idx,
                  value: json[idx],
                  unknown: true
                };
              }
            });

            const knownObservations = Object.values(json).filter(obs => !obs.unknown).length;
            const unknownObservations = parsedCount - knownObservations;
            
            easeeClient.logger.debug(`Charger state processed: ${knownObservations} known, ${unknownObservations} unknown observations`);
            await this.ok(request.path, request.method, json);
            if (done) done();
            return;
          }
        } catch (error) {
          await this.fail(request.path, request.method, error);
          if (done) done();
          return;
        }

      } else if (msg.topic === 'login') {
        easeeClient.logger.debug(`Taking special handling path: login`);
        // Handle login verification
        this.connection
          .ensureAuthentication()
          .then((isAuthenticated) => {
            if (isAuthenticated) {
              this.ok("/accounts/login/", "POST", { success: true, message: "Authentication verified" });
            } else {
              this.fail("/accounts/login/", "POST", new Error("Authentication failed"));
            }
            if (done) done();
          })
          .catch((error) => {
            this.fail("/accounts/login/", "POST", error);
            if (done) done();
          });

      } else if (msg.topic === 'refresh_token') {
        easeeClient.logger.debug(`Taking special handling path: refresh_token`);
        // Handle token refresh
        try {
          const refreshToken = easeeClient.auth.getRefreshToken();
          if (!refreshToken) {
            await this.fail("/accounts/refresh_token/", "POST", new Error("No refresh token available"));
            if (done) done();
            return;
          }

          const { doRefreshToken } = require('../lib/auth/authentication');
          const result = await doRefreshToken(refreshToken);

          if (result.success) {
            await this.ok("/accounts/refresh_token/", "POST", result.data);
          } else {
            await this.fail("/accounts/refresh_token/", "POST", new Error(result.message));
          }
          if (done) done();
        } catch (error) {
          await this.fail("/accounts/refresh_token/", "POST", error);
          if (done) done();
        }

      } else {
        easeeClient.logger.debug(`Taking standard API request path`);
        // Handle standard API requests
        await this.REQUEST(request.path, request.method, request.body);
        if (done) done();
      }
    });

    // Set initial status
    this.status({
      fill: "grey",
      shape: "ring",
      text: "ready",
    });

    easeeClient.logger.info(`REST Client initialized for charger: ${this.charger || 'any'}, site: ${this.site || 'any'}, circuit: ${this.circuit || 'any'}`);
  }

  // Register the node
  RED.nodes.registerType("easee-rest-client", EaseeRestClient);
};
