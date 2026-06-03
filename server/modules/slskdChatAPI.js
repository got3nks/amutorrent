/**
 * Soulseek Chat API
 *
 * REST endpoints for slskd private message conversations.
 * Proxies requests to the connected slskd instance.
 */

'use strict';

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const registry = require('../lib/ClientRegistry');
const response = require('../lib/responseFormatter');
const { requireCapability } = require('../middleware/capabilities');
const logger = require('../lib/logger');

class SlskdChatAPI extends BaseModule {

  /**
   * Get the first connected slskd manager, or the one matching instanceId.
   */
  _getManager(instanceId) {
    if (instanceId) {
      const mgr = registry.get(instanceId);
      if (mgr && mgr.clientType === 'slskd') return mgr;
    }
    const all = registry.getByType('slskd');
    return all.find(m => m.isConnected?.()) || all[0] || null;
  }

  /**
   * GET /api/slskd/conversations/:username
   * Returns the full conversation (with message history) for a single user.
   */
  async getConversation(req, res) {
    try {
      const { username } = req.params;
      const instanceId = req.query.instanceId || null;
      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      let data = null;
      try {
        data = await mgr.client.getConversation(username);
      } catch (err) {
        // slskd returns 404 when no conversation exists yet — return an empty one
        if (err.message && /HTTP 404/i.test(err.message)) {
          return res.json({ success: true, conversation: { username, hasUnread: false, messages: [] } });
        }
        throw err;
      }
      if (!data) return res.json({ success: true, conversation: { username, hasUnread: false, messages: [] } });

      const normaliseDir = (m) => {
        const d = m.direction ?? m.Direction;
        return (d === 'Outgoing' || d === 'Out' || d === 1) ? 'Outgoing' : 'Incoming';
      };

      const conv = {
        username: data.username || data.Username || username,
        hasUnread: !!(data.hasUnacknowledgedMessages || data.HasUnacknowledgedMessages),
        messages: (data.messages || data.Messages || []).map(m => ({
          id:            m.id        ?? m.Id        ?? 0,
          timestamp:     m.timestamp || m.Timestamp || m.sentAt || '',
          username:      m.username  || m.Username  || '',
          message:       m.message   || m.Message   || m.text   || '',
          isAcknowledged: !!(m.isAcknowledged || m.IsAcknowledged),
          direction:     normaliseDir(m)
        }))
      };

      res.json({ success: true, conversation: conv });
    } catch (err) {
      logger.error('[SlskdChatAPI] getConversation:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * GET /api/slskd/conversations
   * Returns all private conversations from the slskd instance.
   */
  async getConversations(req, res) {
    try {
      const instanceId = req.query.instanceId || null;
      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      const data = await mgr.client.getConversations();
      const conversations = Array.isArray(data) ? data : [];

      // Normalise shape: ensure hasUnacknowledgedMessages + sorted by latest message
      const normalised = conversations
        .map(c => ({
          username: c.username || c.Username || c.id || '',
          hasUnread: !!(c.hasUnacknowledgedMessages || c.HasUnacknowledgedMessages),
          messages: (c.messages || c.Messages || []).map(m => ({
            id:        m.id        || m.Id        || 0,
            timestamp: m.timestamp || m.Timestamp || m.sentAt || '',
            username:  m.username  || m.Username  || '',
            message:   m.message   || m.Message   || m.text   || '',
            isAcknowledged: !!(m.isAcknowledged || m.IsAcknowledged),
            direction: (() => { const d = m.direction ?? m.Direction; return (d === 'Outgoing' || d === 'Out' || d === 1) ? 'Outgoing' : 'Incoming'; })()
          }))
        }))
        .filter(c => c.username)
        .sort((a, b) => {
          const aLast = a.messages[a.messages.length - 1]?.timestamp || '';
          const bLast = b.messages[b.messages.length - 1]?.timestamp || '';
          return bLast.localeCompare(aLast);
        });

      res.json({ success: true, conversations: normalised, instanceId: mgr.instanceId });
    } catch (err) {
      logger.error('[SlskdChatAPI] getConversations:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * POST /api/slskd/conversations/:username
   * Send a private message to a user.
   * Body: { message: "text" }
   */
  async sendMessage(req, res) {
    try {
      const { username } = req.params;
      const { message, instanceId } = req.body || {};

      if (!username || !message || !String(message).trim()) {
        return response.badRequest(res, 'username and message are required');
      }

      const mgr = this._getManager(instanceId || null);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.sendConversationMessage(username, String(message).trim());
      res.json({ success: true });
    } catch (err) {
      logger.error('[SlskdChatAPI] sendMessage:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * PUT /api/slskd/conversations/:username/messages/:id/acknowledge
   * Acknowledge (mark as read) a single message.
   */
  async acknowledgeMessage(req, res) {
    try {
      const { username, id } = req.params;
      const instanceId = req.body?.instanceId || req.query.instanceId || null;

      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.acknowledgeConversationMessage(username, id);
      res.json({ success: true });
    } catch (err) {
      // Acknowledge failures are non-critical — log but don't surface
      logger.warn('[SlskdChatAPI] acknowledgeMessage:', err.message);
      res.json({ success: false, error: err.message });
    }
  }

  /**
   * DELETE /api/slskd/conversations/:username
   * Delete an entire conversation.
   */
  async deleteConversation(req, res) {
    try {
      const { username } = req.params;
      const instanceId = req.query.instanceId || null;

      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.deleteConversation(username);
      res.json({ success: true });
    } catch (err) {
      logger.error('[SlskdChatAPI] deleteConversation:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * GET /api/slskd/users/:username
   * Returns basic user info including presence status from slskd.
   */
  async getUserStatus(req, res) {
    try {
      const { username } = req.params;
      const instanceId = req.query.instanceId || null;
      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      const data = await mgr.client.getUserInfo(username);
      const raw = data?.status || data?.Status || data?.presence || data?.Presence || 'none';
      res.json({ success: true, username, status: String(raw).toLowerCase() });
    } catch (_err) {
      // User not found / not online — return neutral status
      res.json({ success: true, username: req.params.username, status: 'none' });
    }
  }

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());
    router.use(requireCapability('search'));  // reuse 'search' cap — chat requires slskd access

    router.get('/',                                    this.getConversations.bind(this));
    router.get('/:username',                           this.getConversation.bind(this));
    router.post('/:username',                          this.sendMessage.bind(this));
    router.put('/:username/messages/:id/acknowledge',  this.acknowledgeMessage.bind(this));
    router.delete('/:username',                        this.deleteConversation.bind(this));

    app.use('/api/slskd/conversations', router);

    const usersRouter = express.Router();
    usersRouter.use(express.json());
    usersRouter.use(requireCapability('search'));
    usersRouter.get('/:username', this.getUserStatus.bind(this));
    app.use('/api/slskd/users', usersRouter);
  }
}

module.exports = new SlskdChatAPI();
