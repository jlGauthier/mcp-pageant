#!/usr/bin/env node
/**
 * Pageant Channel Relay
 *
 * Standalone HTTP daemon that routes messages between agents.
 * Agents register with full identity: relayId, name, role, project.
 * Routing supports: full relayId, name@project, or bare name (if unambiguous).
 *
 * Endpoints:
 *   GET  /subscribe/:relayId?path=...&meta=...  — SSE stream for inbound messages
 *   POST /send                                   — Route a message to a target agent
 *   GET  /agents                                 — List registered agents
 *   GET  /health                                 — Health check
 *
 * Start:
 *   node D:/claudeTools/mcp_pageant/relay.js
 */

import http from 'http';

const PORT = parseInt(process.env.RELAY_PORT || '7760', 10);
const KEEPALIVE_INTERVAL_MS = 30000;

// relayId -> { res, path, meta: { name, role, project, display }, registeredAt, keepaliveInterval }
const subscribers = new Map();

function removeSubscriber(id) {
  const entry = subscribers.get(id);
  if (entry) {
    clearInterval(entry.keepaliveInterval);
    subscribers.delete(id);
    console.error(`[Relay] ${entry.meta?.display || id} disconnected`);
  }
}

/**
 * Resolve a target string to a subscriber entry.
 * Tries in order: exact relayId, name@project, bare name (first match).
 */
function resolveTarget(to) {
  const key = to.toLowerCase().trim();

  // Exact relayId match
  if (subscribers.has(key)) {
    return { id: key, entry: subscribers.get(key) };
  }

  // name@project match
  if (key.includes('@')) {
    const [name, project] = key.split('@');
    for (const [id, entry] of subscribers) {
      if (entry.meta?.name === name && entry.meta?.project === project) {
        return { id, entry };
      }
    }
    return null;
  }

  // Bare name — match first agent with that name
  const matches = [];
  for (const [id, entry] of subscribers) {
    if (entry.meta?.name === key) {
      matches.push({ id, entry });
    }
  }

  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    // Ambiguous — return null but we'll report the options
    return null;
  }

  return null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // --- SSE subscription: GET /subscribe/:relayId?path=...&meta=... ---
  if (req.method === 'GET' && url.pathname.startsWith('/subscribe/')) {
    const relayId = decodeURIComponent(url.pathname.slice('/subscribe/'.length)).toLowerCase().trim();
    const agentPath = url.searchParams.get('path') || '';
    let meta = {};
    try {
      meta = JSON.parse(decodeURIComponent(url.searchParams.get('meta') || '{}'));
    } catch (_) {}

    if (!relayId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing relay ID' }));
      return;
    }

    // Close previous connection for same relay ID
    const existing = subscribers.get(relayId);
    if (existing) {
      clearInterval(existing.keepaliveInterval);
      try { existing.res.end(); } catch (_) {}
      console.error(`[Relay] ${meta.display || relayId} reconnected (replaced stale connection)`);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(': connected\n\n');

    const keepaliveInterval = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch (_) {
        removeSubscriber(relayId);
      }
    }, KEEPALIVE_INTERVAL_MS);

    subscribers.set(relayId, { res, path: agentPath, meta, registeredAt: Date.now(), keepaliveInterval });
    console.error(`[Relay] ${meta.display || relayId} subscribed (${agentPath})`);

    req.on('close', () => removeSubscriber(relayId));
    return;
  }

  // --- Send message: POST /send ---
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { from, from_display, from_path, to, message } = payload;
    if (!to || !message) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing "to" or "message"' }));
      return;
    }

    const resolved = resolveTarget(to);
    if (!resolved) {
      const online = Array.from(subscribers.values()).map(e => ({
        name: e.meta?.name,
        display: e.meta?.display,
        path: e.path
      }));
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Agent "${to}" not found`, online }));
      return;
    }

    const { id: targetId, entry: target } = resolved;
    const event = JSON.stringify({
      content: message,
      meta: {
        from: from_display || from || 'unknown',
        from_path: from_path || '',
        to: target.meta?.display || targetId,
        to_path: target.path
      }
    });

    try {
      target.res.write(`data: ${event}\n\n`);
      console.error(`[Relay] ${from_display || from || '?'} → ${target.meta?.display || targetId}: ${message.slice(0, 80)}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true, to: targetId, to_display: target.meta?.display }));
    } catch (_) {
      removeSubscriber(targetId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to deliver to "${to}" (stale connection)` }));
    }
    return;
  }

  // --- List agents: GET /agents ---
  if (req.method === 'GET' && url.pathname === '/agents') {
    const agents = [];
    for (const [id, entry] of subscribers) {
      agents.push({
        id,
        name: entry.meta?.name || id,
        role: entry.meta?.role || '',
        project: entry.meta?.project || '',
        display: entry.meta?.display || id,
        path: entry.path
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents, count: agents.length }));
    return;
  }

  // --- Health: GET /health ---
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', subscribers: subscribers.size }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.error(`[Relay] Channel relay running on http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  for (const [id] of subscribers) {
    removeSubscriber(id);
  }
  process.exit(0);
});
