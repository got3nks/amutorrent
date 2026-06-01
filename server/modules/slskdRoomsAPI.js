/**
 * Soulseek Rooms API
 *
 * REST endpoints for slskd chat rooms.
 * Proxies requests to the connected slskd instance.
 */

'use strict';

const express = require('express');
const BaseModule = require('../lib/BaseModule');
const registry = require('../lib/ClientRegistry');
const response = require('../lib/responseFormatter');
const { requireCapability } = require('../middleware/capabilities');
const logger = require('../lib/logger');

class SlskdRoomsAPI extends BaseModule {

  _getManager(instanceId) {
    if (instanceId) {
      const mgr = registry.get(instanceId);
      if (mgr && mgr.clientType === 'slskd') return mgr;
    }
    const all = registry.getByType('slskd');
    return all.find(m => m.isConnected?.()) || all[0] || null;
  }

  /**
   * GET /api/slskd/rooms
   * Returns all joined rooms, each with normalised message list.
   * Also includes ownUsername so the frontend can highlight own messages.
   */
  async getRooms(req, res) {
    try {
      const instanceId = req.query.instanceId || null;
      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      // slskd GET /rooms/joined returns an array of room name strings, NOT Room objects.
      const joined = await mgr.client.getRooms();
      const roomNames = Array.isArray(joined) ? joined.filter(n => typeof n === 'string') : [];

      // Fetch full room data for each joined room in parallel
      const results = await Promise.allSettled(
        roomNames.map(name => mgr.client.getRoomByName(name))
      );

      const rooms = results.map((result, i) => {
        const name = roomNames[i];
        if (result.status !== 'fulfilled' || !result.value) {
          return { name, messages: [], users: [], userCount: 0, isPrivate: false };
        }
        return this._normaliseRoom(result.value, name);
      }).filter(r => r.name);

      res.json({
        success:     true,
        rooms,
        ownUsername: mgr.client.username || '',
        instanceId:  mgr.instanceId
      });
    } catch (err) {
      logger.error('[SlskdRoomsAPI] getRooms:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * GET /api/slskd/rooms/:roomName
   * Returns a single joined room with its messages and users.
   */
  async getRoom(req, res) {
    try {
      const roomName = decodeURIComponent(req.params.roomName);
      const instanceId = req.query.instanceId || null;
      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      const d = await mgr.client.getRoomByName(roomName);
      res.json({ success: true, room: this._normaliseRoom(d, roomName), instanceId: mgr.instanceId });
    } catch (err) {
      logger.error('[SlskdRoomsAPI] getRoom:', err.message);
      if (err.message && /HTTP 404/i.test(err.message)) {
        return response.notFound(res, 'Room not found');
      }
      response.serverError(res, err.message);
    }
  }

  /** Normalise a raw slskd Room object into our API shape. */
  _normaliseRoom(d, fallbackName) {
    const users = (d.users || d.Users || []).map(u => ({
      username:    u.username    || u.Username    || '',
      status:      String(u.status || u.Status || 'none').toLowerCase(),
      countryCode: u.countryCode || u.CountryCode || '',
      self:        !!(u.self     || u.Self),
    }));
    return {
      name:      d.name      || d.Name      || fallbackName,
      isPrivate: !!(d.isPrivate || d.IsPrivate),
      userCount: users.length,
      users,
      messages: (d.messages || d.Messages || []).map(m => ({
        username:  m.username  || m.Username  || '',
        message:   m.message   || m.Message   || '',
        timestamp: m.timestamp || m.Timestamp || '',
        self:      !!(m.self   || m.Self),
      })),
    };
  }

  /**
   * POST /api/slskd/rooms
   * Join a room.
   * Body: { roomName, instanceId? }
   */
  async joinRoom(req, res) {
    try {
      const { roomName, instanceId } = req.body || {};
      if (!roomName || !String(roomName).trim()) {
        return response.badRequest(res, 'roomName is required');
      }

      const mgr = this._getManager(instanceId || null);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.joinRoom(String(roomName).trim());
      res.json({ success: true });
    } catch (err) {
      logger.error('[SlskdRoomsAPI] joinRoom:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * DELETE /api/slskd/rooms/:roomName
   * Leave a room.
   */
  async leaveRoom(req, res) {
    try {
      const { roomName } = req.params;
      const instanceId = req.query.instanceId || null;

      const mgr = this._getManager(instanceId);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.leaveRoom(roomName);
      res.json({ success: true });
    } catch (err) {
      logger.error('[SlskdRoomsAPI] leaveRoom:', err.message);
      response.serverError(res, err.message);
    }
  }

  /**
   * POST /api/slskd/rooms/:roomName/messages
   * Send a message to a room.
   * Body: { message, instanceId? }
   */
  async sendMessage(req, res) {
    try {
      const { roomName } = req.params;
      const { message, instanceId } = req.body || {};

      if (!message || !String(message).trim()) {
        return response.badRequest(res, 'message is required');
      }

      const mgr = this._getManager(instanceId || null);
      if (!mgr) return response.serviceUnavailable(res, 'No Soulseek instance available');

      await mgr.client.sendRoomMessage(roomName, String(message).trim());
      res.json({ success: true });
    } catch (err) {
      logger.error('[SlskdRoomsAPI] sendMessage:', err.message);
      response.serverError(res, err.message);
    }
  }

  registerRoutes(app) {
    const router = express.Router();
    router.use(express.json());
    router.use(requireCapability('search'));

    router.get('/',                        this.getRooms.bind(this));
    router.get('/:roomName',               this.getRoom.bind(this));
    router.post('/',                       this.joinRoom.bind(this));
    router.delete('/:roomName',            this.leaveRoom.bind(this));
    router.post('/:roomName/messages',     this.sendMessage.bind(this));

    app.use('/api/slskd/rooms', router);
  }
}

module.exports = new SlskdRoomsAPI();
