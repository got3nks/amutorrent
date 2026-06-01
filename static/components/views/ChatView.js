/**
 * ChatView Component
 *
 * Soulseek chat: private messages (DMs) + rooms.
 * Only visible when an slskd instance is enabled/connected.
 */

import React from 'https://esm.sh/react@18.2.0';
const { createElement: h, useState, useEffect, useRef, useCallback } = React;

import { Icon, EmptyState } from '../common/index.js';
import { useStaticData } from '../../contexts/StaticDataContext.js';
import { VIEW_TITLE_STYLES } from '../../utils/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function apiParams(instanceId) {
  return instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : '';
}

// ---------------------------------------------------------------------------
// MessageInput — shared textarea + send button, manages its own state
// ---------------------------------------------------------------------------
const MessageInput = ({ placeholder, onSend, disabled = false }) => {
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending || disabled) return;
    setSending(true);
    setErr(null);
    try {
      await onSend(text);
      setInput('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return h('div', { className: 'px-3 py-2 border-t border-gray-200 dark:border-gray-700 shrink-0' },
    err && h('p', { className: 'text-xs text-red-500 mb-1' }, err),
    h('div', { className: 'flex gap-2 items-end' },
      h('textarea', {
        ref: inputRef,
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder,
        rows: 1,
        disabled: disabled || sending,
        className: [
          'flex-1 resize-none rounded-lg border border-gray-200 dark:border-gray-600',
          'bg-white dark:bg-gray-700 text-sm px-3 py-2',
          'text-gray-900 dark:text-gray-100 placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600',
          'disabled:opacity-50 max-h-28 overflow-y-auto'
        ].join(' ')
      }),
      h('button', {
        onClick: handleSend,
        disabled: !input.trim() || disabled || sending,
        className: [
          'shrink-0 p-2 rounded-lg transition-colors',
          input.trim() && !disabled && !sending
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed'
        ].join(' ')
      },
        sending
          ? h(Icon, { name: 'loader', size: 18, className: 'animate-spin' })
          : h(Icon, { name: 'send', size: 18 })
      )
    )
  );
};

// ---------------------------------------------------------------------------
// DmBubble — private message bubble, aligned by direction
// ---------------------------------------------------------------------------
const DmBubble = ({ msg }) => {
  const isOutgoing = msg.direction === 'Outgoing';
  return h('div', { className: `flex ${isOutgoing ? 'justify-end' : 'justify-start'} mb-1` },
    h('div', {
      className: [
        'max-w-[75%] px-3 py-1.5 rounded-2xl text-sm',
        isOutgoing
          ? 'bg-blue-500 text-white rounded-br-sm'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
      ].join(' ')
    },
      h('p', { className: 'break-words' }, msg.message),
      h('p', {
        className: `text-[10px] mt-0.5 ${isOutgoing ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`
      }, formatTimestamp(msg.timestamp))
    )
  );
};

// ---------------------------------------------------------------------------
// RoomBubble — room message bubble, shows sender username for others
// ---------------------------------------------------------------------------
const RoomBubble = ({ msg, ownUsername }) => {
  const isOwn = msg.self || msg.username === ownUsername;
  return h('div', { className: `flex ${isOwn ? 'justify-end' : 'justify-start'} mb-2` },
    h('div', { className: 'max-w-[78%]' },
      !isOwn && h('p', {
        className: 'text-[11px] font-medium text-blue-600 dark:text-blue-400 mb-0.5 px-1'
      }, msg.username),
      h('div', {
        className: [
          'px-3 py-1.5 rounded-2xl text-sm',
          isOwn
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm'
        ].join(' ')
      },
        h('p', { className: 'break-words' }, msg.message),
        h('p', {
          className: `text-[10px] mt-0.5 ${isOwn ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`
        }, formatTimestamp(msg.timestamp))
      )
    )
  );
};

// ---------------------------------------------------------------------------
// StatusDot — colored presence indicator
// ---------------------------------------------------------------------------
const StatusDot = ({ status, className = '' }) => {
  const color = status === 'online'
    ? 'bg-green-400'
    : status === 'away'
      ? 'bg-amber-400'
      : 'bg-gray-300 dark:bg-gray-600';
  return h('span', {
    className: `inline-block w-2 h-2 rounded-full shrink-0 ${color} ${className}`,
    title: status !== 'none' ? status : undefined
  });
};

// ---------------------------------------------------------------------------
// ConversationItem — DM list row
// ---------------------------------------------------------------------------
const ConversationItem = ({ conv, active, onClick, status = 'none' }) => (
  h('button', {
    onClick,
    className: [
      'w-full text-left px-2 py-2 rounded-lg transition-colors',
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
    ].join(' ')
  },
    h('div', { className: 'flex items-center gap-2' },
      h('div', { className: 'relative shrink-0' },
        h('div', { className: 'w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center' },
          h('span', { className: 'text-xs font-semibold text-blue-600 dark:text-blue-300' },
            (conv.username[0] || '?').toUpperCase()
          )
        ),
        status !== 'none' && h('span', {
          className: `absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-gray-800 ${
            status === 'online' ? 'bg-green-400' : status === 'away' ? 'bg-amber-400' : 'bg-gray-400'
          }`
        })
      ),
      h('div', { className: 'flex-1 min-w-0' },
        h('div', { className: 'flex items-center justify-between gap-1' },
          h('span', {
            className: [
              'text-sm font-medium truncate',
              conv.hasUnread ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
            ].join(' ')
          }, conv.username),
          conv.hasUnread && h('span', { className: 'shrink-0 w-2 h-2 rounded-full bg-blue-500' })
        )
      )
    )
  )
);

// ---------------------------------------------------------------------------
// RoomItem — room list row with inline leave button
// ---------------------------------------------------------------------------
const RoomItem = ({ room, active, onClick, onLeave }) => (
  h('button', {
    onClick,
    className: [
      'w-full text-left px-2 py-2 rounded-lg transition-colors group',
      active
        ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700'
        : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
    ].join(' ')
  },
    h('div', { className: 'flex items-center gap-2' },
      h('div', { className: 'w-7 h-7 rounded-md bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0' },
        h(Icon, { name: 'hash', size: 13, className: 'text-purple-600 dark:text-purple-400' })
      ),
      h('div', { className: 'flex-1 min-w-0' },
        h('span', { className: 'text-sm font-medium truncate block text-gray-700 dark:text-gray-300' }, room.name),
        room.userCount > 0 && h('span', { className: 'text-[11px] text-gray-400 dark:text-gray-500' }, `${room.userCount} users`)
      ),
      h('button', {
        onClick: (e) => { e.stopPropagation(); onLeave(); },
        title: 'Leave room',
        className: 'shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all'
      }, h(Icon, { name: 'x', size: 13 }))
    )
  )
);

// ---------------------------------------------------------------------------
// InlineInput — expandable add/join row at bottom of each list section
// ---------------------------------------------------------------------------
const InlineInput = ({ placeholder, submitLabel, onSubmit, onCancel }) => {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async () => {
    const v = value.trim();
    if (!v || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await onSubmit(v);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') onCancel();
  };

  return h('div', { className: 'px-2 py-2' },
    err && h('p', { className: 'text-xs text-red-500 mb-1 px-1' }, err),
    h('div', { className: 'flex gap-1' },
      h('input', {
        ref: inputRef,
        value,
        onChange: e => setValue(e.target.value),
        onKeyDown: handleKeyDown,
        placeholder,
        disabled: busy,
        className: [
          'flex-1 text-sm rounded-md border border-gray-200 dark:border-gray-600',
          'bg-white dark:bg-gray-700 px-2 py-1.5',
          'text-gray-900 dark:text-gray-100 placeholder-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-600',
          'disabled:opacity-50'
        ].join(' ')
      }),
      h('button', {
        onClick: handleSubmit,
        disabled: !value.trim() || busy,
        className: [
          'shrink-0 px-2 py-1 rounded-md text-xs font-medium transition-colors',
          value.trim() && !busy
            ? 'bg-blue-500 hover:bg-blue-600 text-white'
            : 'bg-gray-200 dark:bg-gray-600 text-gray-400 cursor-not-allowed'
        ].join(' ')
      }, busy ? h(Icon, { name: 'loader', size: 12, className: 'animate-spin' }) : submitLabel),
      h('button', {
        onClick: onCancel,
        title: 'Cancel',
        className: 'shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors'
      }, h(Icon, { name: 'x', size: 14 }))
    )
  );
};

// ---------------------------------------------------------------------------
// PanelHeader — shared header bar for DM and room panels
// ---------------------------------------------------------------------------
const PanelHeader = ({ onBack, avatar, title, subtitle }) => (
  h('div', { className: 'flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0' },
    onBack && h('button', {
      onClick: onBack,
      className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-0.5'
    }, h(Icon, { name: 'chevronLeft', size: 18 })),
    avatar,
    h('div', { className: 'flex-1 min-w-0' },
      h('p', { className: 'font-semibold text-sm text-gray-900 dark:text-white truncate' }, title),
      subtitle && h('p', { className: 'text-[11px] text-gray-400 dark:text-gray-500' }, subtitle)
    )
  )
);

// ---------------------------------------------------------------------------
// ThreadPanel — private message thread, self-manages message fetching
// ---------------------------------------------------------------------------
const ThreadPanel = ({ username, instanceId, onBack, onConversationUpdated }) => {
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [userStatus, setUserStatus] = useState('none');
  const bottomRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    if (!username) return;
    try {
      const res = await fetch(`/api/slskd/conversations/${encodeURIComponent(username)}${apiParams(instanceId)}`);
      const data = await res.json();
      if (data.success && data.conversation) setMessages(data.conversation.messages || []);
    } catch (_) {}
  }, [username, instanceId]);

  useEffect(() => {
    if (!username) { setMessages([]); return; }
    setMsgLoading(true);
    setMessages([]);
    fetchMessages().finally(() => setMsgLoading(false));
    const id = setInterval(fetchMessages, 15000);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  // Auto-acknowledge unread incoming messages
  useEffect(() => {
    const unread = messages.filter(m => !m.isAcknowledged && m.direction === 'Incoming');
    if (unread.length === 0) return;
    Promise.all(unread.map(m =>
      fetch(`/api/slskd/conversations/${encodeURIComponent(username)}/messages/${m.id}/acknowledge${apiParams(instanceId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId })
      }).catch(() => {})
    )).then(() => onConversationUpdated?.());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // Fetch user presence status when DM thread opens
  useEffect(() => {
    if (!username) { setUserStatus('none'); return; }
    fetch(`/api/slskd/users/${encodeURIComponent(username)}${apiParams(instanceId)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setUserStatus(d.status || 'none'); })
      .catch(() => {});
  }, [username, instanceId]);

  const handleSend = async (text) => {
    const res = await fetch(`/api/slskd/conversations/${encodeURIComponent(username)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, instanceId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Send failed');
    fetchMessages();
    onConversationUpdated?.();
  };

  if (!username) return null;

  return h('div', { className: 'flex flex-col h-full' },
    h(PanelHeader, {
      onBack,
      avatar: h('div', { className: 'relative shrink-0' },
        h('div', { className: 'w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center' },
          h('span', { className: 'text-sm font-semibold text-blue-600 dark:text-blue-300' },
            (username[0] || '?').toUpperCase()
          )
        ),
        userStatus !== 'none' && h('span', {
          className: `absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-800 ${userStatus === 'online' ? 'bg-green-400' : userStatus === 'away' ? 'bg-amber-400' : 'bg-gray-400'}`
        })
      ),
      title: username
    }),
    h('div', { className: 'flex-1 overflow-y-auto px-3 py-3 min-h-0' },
      msgLoading
        ? h('div', { className: 'flex items-center justify-center h-full' },
            h(Icon, { name: 'loader', size: 20, className: 'animate-spin text-gray-400 dark:text-gray-500' }))
        : messages.length === 0
          ? h('div', { className: 'flex items-center justify-center h-full text-gray-400 dark:text-gray-500 text-sm' }, 'No messages yet')
          : messages.map(msg => h(DmBubble, { key: msg.id || msg.timestamp, msg })),
      h('div', { ref: bottomRef })
    ),
    h(MessageInput, { placeholder: `Message ${username}…`, onSend: handleSend })
  );
};

// ---------------------------------------------------------------------------
// RoomPanel — room thread, polls per-room endpoint, shows users with status
// ---------------------------------------------------------------------------
const RoomPanel = ({ roomName, instanceId, ownUsername, onBack, onRoomsUpdated }) => {
  const [messages,  setMessages]  = useState([]);
  const [users,     setUsers]     = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);
  const [showUsers,  setShowUsers]  = useState(true);
  const bottomRef = useRef(null);

  const fetchRoom = useCallback(async () => {
    if (!roomName) return;
    try {
      const res = await fetch(`/api/slskd/rooms/${encodeURIComponent(roomName)}${apiParams(instanceId)}`);
      const data = await res.json();
      if (data.success && data.room) {
        setMessages(data.room.messages || []);
        setUsers(data.room.users || []);
        setUserCount(data.room.userCount || 0);
      }
    } catch (_) {}
  }, [roomName, instanceId]);

  useEffect(() => {
    if (!roomName) { setMessages([]); setUsers([]); return; }
    setMsgLoading(true);
    setMessages([]);
    fetchRoom().finally(() => setMsgLoading(false));
    const id = setInterval(fetchRoom, 10000);
    return () => clearInterval(id);
  }, [fetchRoom]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const handleSend = async (text) => {
    const res = await fetch(`/api/slskd/rooms/${encodeURIComponent(roomName)}/messages${apiParams(instanceId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, instanceId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Send failed');
    setTimeout(fetchRoom, 600);
    onRoomsUpdated?.();
  };

  if (!roomName) return null;

  const onlineCount = users.filter(u => u.status === 'online').length;

  return h('div', { className: 'flex flex-col h-full' },
    // Header with users toggle button
    h('div', { className: 'flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0' },
      onBack && h('button', {
        onClick: onBack,
        className: 'p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors mr-0.5'
      }, h(Icon, { name: 'chevronLeft', size: 18 })),
      h('div', { className: 'w-8 h-8 rounded-md bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0' },
        h(Icon, { name: 'hash', size: 16, className: 'text-purple-600 dark:text-purple-400' })
      ),
      h('div', { className: 'flex-1 min-w-0' },
        h('p', { className: 'font-semibold text-sm text-gray-900 dark:text-white truncate' }, roomName),
        userCount > 0 && h('p', { className: 'text-[11px] text-gray-400 dark:text-gray-500' },
          onlineCount > 0 ? `${onlineCount} online · ${userCount} total` : `${userCount} users`)
      ),
      h('button', {
        onClick: () => setShowUsers(v => !v),
        title: showUsers ? 'Hide users' : 'Show users',
        className: [
          'shrink-0 p-1.5 rounded-lg transition-colors',
          showUsers
            ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
            : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        ].join(' ')
      }, h(Icon, { name: 'users', size: 15 }))
    ),
    h('div', { className: 'flex flex-1 min-h-0' },
      // Messages column
      h('div', { className: 'flex flex-col flex-1 min-h-0 min-w-0' },
        h('div', { className: 'flex-1 scroll-hover px-3 py-3 min-h-0' },
          msgLoading
            ? h('div', { className: 'flex items-center justify-center h-full' },
                h(Icon, { name: 'loader', size: 20, className: 'animate-spin text-gray-400 dark:text-gray-500' }))
            : messages.length === 0
              ? h('div', { className: 'flex flex-col items-center justify-center h-full gap-2 text-gray-400 dark:text-gray-500' },
                  h(Icon, { name: 'hash', size: 28, className: 'opacity-25' }),
                  h('span', { className: 'text-sm' }, 'No messages yet'))
              : messages.map((msg, i) => h(RoomBubble, { key: `${msg.timestamp}-${i}`, msg, ownUsername })),
          h('div', { ref: bottomRef })
        ),
        h(MessageInput, { placeholder: `Message #${roomName}…`, onSend: handleSend })
      ),
      // Users sidebar (collapsible)
      showUsers && h('div', {
        className: 'w-40 shrink-0 border-l border-gray-200 dark:border-gray-700 scroll-hover bg-gray-50 dark:bg-gray-800/50'
      },
        h('p', { className: 'text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-3 py-2 border-b border-gray-100 dark:border-gray-700' },
          `Users (${userCount})`),
        users.map(u =>
          h('div', { key: u.username, className: 'flex items-center gap-2 px-3 py-1.5' },
            h(StatusDot, { status: u.status }),
            h('span', {
              className: [
                'text-xs truncate',
                u.self ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'
              ].join(' '),
              title: u.username
            }, u.username)
          )
        )
      )
    )
  );
};

// ---------------------------------------------------------------------------
// ChatView — main component
// ---------------------------------------------------------------------------
const ChatView = () => {
  const { instances } = useStaticData();
  const slskdInstance = Object.values(instances).find(i => i.type === 'slskd' && i.connected)
    || Object.values(instances).find(i => i.type === 'slskd');
  const instanceId = slskdInstance?.instanceId || null;

  const [activeTab, setActiveTab] = useState('dms');      // 'dms' | 'rooms'

  // DMs
  const [conversations, setConversations] = useState([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [convsError, setConvsError] = useState(null);
  const [showNewDm, setShowNewDm] = useState(false);
  const [userStatuses, setUserStatuses] = useState({});

  // Rooms
  const [rooms, setRooms] = useState([]);
  const [ownUsername, setOwnUsername] = useState('');
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState(null);
  const [showJoinRoom, setShowJoinRoom] = useState(false);

  // Selected panel: null | { type: 'dm', username } | { type: 'room', name }
  const [selectedPanel, setSelectedPanel] = useState(null);
  const [showThread, setShowThread] = useState(false);   // mobile: show thread pane

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/slskd/conversations${apiParams(instanceId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load conversations');
      const convs = data.conversations || [];
      setConversations(convs);
      setConvsError(null);
      // Async: batch-fetch presence status for all conversation partners
      if (convs.length > 0) {
        Promise.allSettled(convs.map(c =>
          fetch(`/api/slskd/users/${encodeURIComponent(c.username)}${apiParams(instanceId)}`)
            .then(r => r.json())
            .then(d => d?.success ? [c.username, d.status || 'none'] : null)
            .catch(() => null)
        )).then(results => {
          const map = {};
          results.forEach(r => { if (r.status === 'fulfilled' && r.value) map[r.value[0]] = r.value[1]; });
          setUserStatuses(prev => ({ ...prev, ...map }));
        });
      }
    } catch (err) {
      setConvsError(err.message);
    } finally {
      setConvsLoading(false);
    }
  }, [instanceId]);

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch(`/api/slskd/rooms${apiParams(instanceId)}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load rooms');
      setRooms(data.rooms || []);
      if (data.ownUsername) setOwnUsername(data.ownUsername);
      setRoomsError(null);
    } catch (err) {
      setRoomsError(err.message);
    } finally {
      setRoomsLoading(false);
    }
  }, [instanceId]);

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, 30000);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 15000);
    return () => clearInterval(id);
  }, [fetchRooms]);

  const handleSelectDm   = (username) => { setSelectedPanel({ type: 'dm', username }); setShowThread(true); };
  const handleSelectRoom = (name)     => { setSelectedPanel({ type: 'room', name });   setShowThread(true); };
  const handleBack       = ()         => setShowThread(false);

  const handleNewDm = async (username) => {
    setShowNewDm(false);
    handleSelectDm(username.trim());
  };

  const handleJoinRoom = async (roomName) => {
    const res = await fetch('/api/slskd/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName: roomName.trim(), instanceId })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to join room');
    setShowJoinRoom(false);
    await fetchRooms();
    setActiveTab('rooms');
    handleSelectRoom(roomName.trim());
  };

  const handleLeaveRoom = async (roomName) => {
    try {
      await fetch(`/api/slskd/rooms/${encodeURIComponent(roomName)}${apiParams(instanceId)}`, { method: 'DELETE' });
      if (selectedPanel?.type === 'room' && selectedPanel.name === roomName) {
        setSelectedPanel(null);
        setShowThread(false);
      }
      fetchRooms();
    } catch (_) {}
  };

  if (!slskdInstance) {
    return h('div', { className: 'w-full lg:w-5/6 mx-auto px-2 py-4 sm:px-4' },
      h(EmptyState, {
        icon: 'messageSquare',
        title: 'Soulseek not enabled',
        description: 'Add and enable a Soulseek (slskd) client instance in Settings to use chat.'
      })
    );
  }

  // Sidebar list renderers
  const renderDmList = () => {
    if (convsLoading) return h('div', { className: 'flex justify-center py-8' },
      h(Icon, { name: 'loader', size: 18, className: 'animate-spin text-gray-400' }));
    if (convsError) return h('p', { className: 'text-xs text-red-500 px-3 py-4 text-center' }, convsError);
    if (conversations.length === 0) return h('div', { className: 'px-3 py-8 text-center' },
      h('p', { className: 'text-xs text-gray-400 dark:text-gray-500' }, 'No conversations yet'));
    return h('div', { className: 'py-1.5 space-y-0.5' },
      conversations.map(conv =>
        h(ConversationItem, {
          key: conv.username,
          conv,
          status: userStatuses[conv.username] || 'none',
          active: selectedPanel?.type === 'dm' && selectedPanel.username === conv.username,
          onClick: () => handleSelectDm(conv.username)
        })
      )
    );
  };

  const renderRoomList = () => {
    if (roomsLoading) return h('div', { className: 'flex justify-center py-8' },
      h(Icon, { name: 'loader', size: 18, className: 'animate-spin text-gray-400' }));
    if (roomsError) return h('p', { className: 'text-xs text-red-500 px-3 py-4 text-center' }, roomsError);
    if (rooms.length === 0) return h('div', { className: 'px-3 py-8 text-center' },
      h('p', { className: 'text-xs text-gray-400 dark:text-gray-500' }, 'No rooms joined yet'));
    return h('div', { className: 'py-1.5 space-y-0.5' },
      rooms.map(room =>
        h(RoomItem, {
          key: room.name,
          room,
          active: selectedPanel?.type === 'room' && selectedPanel.name === room.name,
          onClick: () => handleSelectRoom(room.name),
          onLeave: () => handleLeaveRoom(room.name)
        })
      )
    );
  };

  return h('div', { className: 'w-full lg:w-5/6 mx-auto px-2 py-4 sm:px-4 flex flex-col h-full' },
    h('div', { className: 'flex items-center gap-2 mb-4 shrink-0' },
      h('h1', { className: VIEW_TITLE_STYLES }, 'Soulseek Chat')
    ),

    h('div', {
      className: 'flex flex-1 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-h-0',
      style: { height: 'calc(100vh - 180px)' }
    },

      // ---- Left sidebar ----
      h('div', {
        className: [
          'flex flex-col w-full md:w-60 shrink-0',
          'border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800',
          showThread ? 'hidden md:flex' : 'flex'
        ].join(' ')
      },

        // Tab bar
        h('div', { className: 'flex shrink-0 border-b border-gray-200 dark:border-gray-700' },
          h('button', {
            onClick: () => setActiveTab('dms'),
            className: [
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              activeTab === 'dms'
                ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'
            ].join(' ')
          }, h(Icon, { name: 'messageSquare', size: 13 }), 'Messages'),
          h('button', {
            onClick: () => setActiveTab('rooms'),
            className: [
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2',
              activeTab === 'rooms'
                ? 'text-blue-600 dark:text-blue-400 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 border-transparent'
            ].join(' ')
          }, h(Icon, { name: 'hash', size: 13 }), 'Rooms')
        ),

        // List
        h('div', { className: 'flex-1 overflow-y-auto px-2' },
          activeTab === 'dms' ? renderDmList() : renderRoomList()
        ),

        // Footer action
        h('div', { className: 'shrink-0 border-t border-gray-200 dark:border-gray-700' },
          activeTab === 'dms' && (
            showNewDm
              ? h(InlineInput, {
                  placeholder: 'Enter username…',
                  submitLabel: 'Open',
                  onSubmit: handleNewDm,
                  onCancel: () => setShowNewDm(false)
                })
              : h('button', {
                  onClick: () => { setShowNewDm(true); setShowJoinRoom(false); },
                  className: 'w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
                }, h(Icon, { name: 'plus', size: 13 }), 'New message')
          ),
          activeTab === 'rooms' && (
            showJoinRoom
              ? h(InlineInput, {
                  placeholder: 'Room name…',
                  submitLabel: 'Join',
                  onSubmit: handleJoinRoom,
                  onCancel: () => setShowJoinRoom(false)
                })
              : h('button', {
                  onClick: () => { setShowJoinRoom(true); setShowNewDm(false); },
                  className: 'w-full flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
                }, h(Icon, { name: 'plus', size: 13 }), 'Join a room')
          )
        )
      ),

      // ---- Right panel ----
      h('div', {
        className: [
          'flex-1 bg-white dark:bg-gray-800',
          !showThread ? 'hidden md:flex md:flex-col' : 'flex flex-col'
        ].join(' ')
      },
        selectedPanel?.type === 'dm'
          ? h(ThreadPanel, {
              username: selectedPanel.username,
              instanceId,
              onBack: handleBack,
              onConversationUpdated: fetchConversations
            })
          : selectedPanel?.type === 'room'
            ? h(RoomPanel, {
                roomName: selectedPanel.name,
                instanceId,
                ownUsername,
                onBack: handleBack,
                onRoomsUpdated: fetchRooms
              })
            : h('div', {
                className: 'hidden md:flex flex-col items-center justify-center h-full gap-3 text-gray-400 dark:text-gray-500'
              },
                h(Icon, { name: 'messageSquare', size: 36, className: 'opacity-25' }),
                h('p', { className: 'text-sm' }, 'Select a conversation or room')
              )
      )
    )
  );
};

export default ChatView;
