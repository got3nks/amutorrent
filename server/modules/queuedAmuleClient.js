/**
 * QueuedAmuleClient - Wrapper class for amule-ec-node that automatically manages request queuing
 * This eliminates the need to manually call enqueueAmuleCall throughout the codebase
 */

const AmuleClient = require('amule-ec-node');

class QueuedAmuleClient {
  constructor(host, port, password) {
    this.client = new AmuleClient(host, port, password);
    this.requestQueue = Promise.resolve();
    this.pendingRequests = 0;
    this.connectionLost = false;
    this.errorHandler = null;

    // Add error handling for the underlying protocol to prevent crashes
    this.setupErrorHandlers();

    // Create a proxy to handle all method calls automatically
    return new Proxy(this, {
      get(target, prop) {
        // Handle our own methods
        if (prop in target && typeof target[prop] === 'function') {
          return target[prop].bind(target);
        }

        // Handle client methods
        if (target.client && typeof target.client[prop] === 'function') {
          return (...args) => {
            return target.queueRequest(() => target.client[prop](...args), prop);
          };
        }

        // Handle properties
        return target.client ? target.client[prop] : undefined;
      }
    });
  }

  /**
   * Setup error handlers to prevent unhandled errors from crashing the server
   */
  setupErrorHandlers() {
    try {
      // Access the underlying ECProtocol session if available
      // AmuleClient uses 'session' not 'protocol'
      if (this.client && this.client.session) {
        const session = this.client.session;

        // Add error event listener
        if (session.socket) {
          session.socket.on('error', (err) => {
            console.error('[QueuedAmuleClient] Socket error:', err.message);
            this.connectionLost = true;
            if (this.errorHandler) {
              this.errorHandler(err);
            }
          });

          session.socket.on('close', () => {
            this.connectionLost = true;
          });
        }
      }
    } catch (err) {
      // Ignore setup errors - this is defensive programming
      console.warn('[QueuedAmuleClient] Could not setup error handlers:', err.message);
    }
  }

  /**
   * Set external error handler
   */
  onError(handler) {
    this.errorHandler = handler;
  }

  // Internal queue management
  queueRequest(fn, methodName) {
    const previous = this.requestQueue;
    this.pendingRequests++;
    const queueLength = this.pendingRequests;

    const current = previous
      .then(() => {
        const name = methodName || fn.name || 'anonymous';
        //if(queueLength>1) console.debug(`[QueuedAmuleClient] Previous request finished. Processing next: ${name} | Pending requests: ${queueLength}`);
        return fn();
      })
      .catch(err => {
        console.warn(`QueuedAmuleClient request failed (${methodName}):`, err.message);
        return null;
      })
      .finally(() => {
        this.pendingRequests--;
      });

    this.requestQueue = current.then(() => {}, () => {});
    return current;
  }

  // Connection methods - NOT queued as they establish the connection itself
  async connect() {
    try {
      this.connectionLost = false;
      const result = await this.client.connect();
      // Setup error handlers after successful connection
      this.setupErrorHandlers();
      return result;
    } catch (err) {
      this.connectionLost = true;
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this.client && typeof this.client.close === 'function') {
        // AmuleClient uses close() not disconnect()
        return await this.client.close();
      }
    } catch (err) {
      // Ignore disconnect errors
      console.warn('[QueuedAmuleClient] Disconnect error:', err.message);
    }
  }

  // Status methods - not queued as they're synchronous checks
  isConnected() {
    // AmuleClient doesn't have isConnected() method
    // Check if session exists and socket is not destroyed
    if (!this.client || !this.client.session) {
      return false;
    }
    return this.client.session.socket && !this.client.session.socket.destroyed;
  }

  getQueueStatus() {
    return {
      pendingRequests: this.pendingRequests,
      queueLength: this.pendingRequests
    };
  }
}

module.exports = QueuedAmuleClient;