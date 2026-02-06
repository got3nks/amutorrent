/**
 * Notifications API Module
 * Provides REST endpoints for notification service management
 */

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const notificationManager = require('../lib/NotificationManager');
const response = require('../lib/responseFormatter');

class NotificationsAPI extends BaseModule {
  constructor() {
    super();
  }

  // ==========================================================================
  // API ENDPOINTS
  // ==========================================================================

  /**
   * GET /api/notifications/status
   * Returns Apprise availability status
   */
  async getStatus(req, res) {
    try {
      const status = notificationManager.getAppriseStatus();
      res.json(status);
    } catch (err) {
      this.log('Error getting Apprise status:', err.message);
      response.serverError(res, 'Failed to get Apprise status');
    }
  }

  /**
   * GET /api/notifications/config
   * Returns notification settings (enabled state, events)
   */
  async getConfig(req, res) {
    try {
      const cfg = notificationManager.getConfig();
      res.json(cfg);
    } catch (err) {
      this.log('Error getting notification config:', err.message);
      response.serverError(res, 'Failed to get notification configuration');
    }
  }

  /**
   * POST /api/notifications/config
   * Save notification settings (enabled state, events)
   * Body: { enabled: boolean, events: { eventType: boolean, ... } }
   */
  async saveConfig(req, res) {
    try {
      const { enabled, events } = req.body;

      notificationManager.saveConfig({ enabled, events });

      res.json({
        success: true,
        message: 'Notification configuration saved'
      });
    } catch (err) {
      this.log('Error saving notification config:', err.message);
      response.serverError(res, 'Failed to save notification configuration');
    }
  }

  /**
   * GET /api/notifications/services
   * List all configured notification services
   */
  async getServices(req, res) {
    try {
      const services = notificationManager.getServices();
      res.json({ services });
    } catch (err) {
      this.log('Error getting notification services:', err.message);
      response.serverError(res, 'Failed to get notification services');
    }
  }

  /**
   * POST /api/notifications/services
   * Add a new notification service
   * Body: { name: string, type: string, enabled: boolean, config: object }
   */
  async addService(req, res) {
    try {
      const { name, type, enabled, config } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        return response.badRequest(res, 'Service name is required');
      }

      if (!type || typeof type !== 'string') {
        return response.badRequest(res, 'Service type is required');
      }

      const validTypes = ['discord', 'telegram', 'slack', 'pushover', 'ntfy', 'gotify', 'email', 'webhook', 'custom'];
      if (!validTypes.includes(type)) {
        return response.badRequest(res, `Invalid service type. Must be one of: ${validTypes.join(', ')}`);
      }

      const service = notificationManager.addService({
        name: name.trim(),
        type,
        enabled: enabled !== false,
        config: config || {}
      });

      res.status(201).json({
        success: true,
        service
      });
    } catch (err) {
      this.log('Error adding notification service:', err.message);
      response.serverError(res, 'Failed to add notification service');
    }
  }

  /**
   * PUT /api/notifications/services/:id
   * Update an existing notification service
   * Body: { name?: string, enabled?: boolean, config?: object }
   */
  async updateService(req, res) {
    try {
      const { id } = req.params;
      const { name, enabled, config } = req.body;

      const service = notificationManager.updateService(id, {
        name,
        enabled,
        config
      });

      if (!service) {
        return response.notFound(res, 'Service not found');
      }

      res.json({
        success: true,
        service
      });
    } catch (err) {
      this.log('Error updating notification service:', err.message);
      response.serverError(res, 'Failed to update notification service');
    }
  }

  /**
   * DELETE /api/notifications/services/:id
   * Delete a notification service
   */
  async deleteService(req, res) {
    try {
      const { id } = req.params;

      const deleted = notificationManager.deleteService(id);
      if (!deleted) {
        return response.notFound(res, 'Service not found');
      }

      res.json({
        success: true,
        message: 'Service deleted'
      });
    } catch (err) {
      this.log('Error deleting notification service:', err.message);
      response.serverError(res, 'Failed to delete notification service');
    }
  }

  /**
   * POST /api/notifications/test
   * Test all enabled notification services
   */
  async testAll(req, res) {
    try {
      const result = await notificationManager.testServices(null);
      res.json(result);
    } catch (err) {
      this.log('Error testing notifications:', err.message);
      response.serverError(res, 'Failed to test notifications');
    }
  }

  /**
   * POST /api/notifications/test/:id
   * Test a specific notification service
   */
  async testService(req, res) {
    try {
      const { id } = req.params;

      const result = await notificationManager.testServices(id);
      res.json(result);
    } catch (err) {
      this.log('Error testing notification service:', err.message);
      response.serverError(res, 'Failed to test notification service');
    }
  }

  /**
   * Register all notification API routes
   */
  registerRoutes(app) {
    const router = express.Router();

    // All routes use JSON
    router.use(express.json());

    // GET /api/notifications/status - Get Apprise availability
    router.get('/status', this.getStatus.bind(this));

    // GET /api/notifications/config - Get notification settings
    router.get('/config', this.getConfig.bind(this));

    // POST /api/notifications/config - Save notification settings
    router.post('/config', this.saveConfig.bind(this));

    // GET /api/notifications/services - List all services
    router.get('/services', this.getServices.bind(this));

    // POST /api/notifications/services - Add new service
    router.post('/services', this.addService.bind(this));

    // PUT /api/notifications/services/:id - Update service
    router.put('/services/:id', this.updateService.bind(this));

    // DELETE /api/notifications/services/:id - Delete service
    router.delete('/services/:id', this.deleteService.bind(this));

    // POST /api/notifications/test - Test all services
    router.post('/test', this.testAll.bind(this));

    // POST /api/notifications/test/:id - Test specific service
    router.post('/test/:id', this.testService.bind(this));

    // Mount router
    app.use('/api/notifications', router);

    this.log('Notifications API routes registered');
  }
}

module.exports = new NotificationsAPI();
