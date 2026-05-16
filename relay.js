#!/usr/bin/env node
/**
 * Pageant Channel Relay
 *
 * Standalone HTTP daemon that routes messages between agents.
 * Agents register with full identity: relayId, name, job, project.
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

// relayId -> { res, path, meta: { name, job, project, display }, registeredAt, keepaliveInterval, writeCount, lastWriteAt, lastSentAt, status }
const subscribers = new Map();

// project -> Array<{ from, to, message, timestamp }> — ring buffer per project
const HISTORY_MAX = 100;
const history = new Map();

function pushHistory(project, entry) {
  if (!project) return;
  if (!history.has(project)) history.set(project, []);
  const buf = history.get(project);
  buf.push({ ...entry, timestamp: Date.now() });
  if (buf.length > HISTORY_MAX) buf.splice(0, buf.length - HISTORY_MAX);
}

function removeSubscriber(id) {
  const entry = subscribers.get(id);
  if (entry) {
    clearInterval(entry.keepaliveInterval);
    subscribers.delete(id);
    console.error(`[Relay] DISCONNECT ${entry.meta?.display || id} (was writes=${entry.writeCount})`);
  }
}

/**
 * Resolve a target string to a subscriber entry.
 * Tries in order: exact relayId, name@project, bare name (first match).
 * FAILS LOUD on ambiguity.
 */
function resolveTarget(to) {
  const key = to.toLowerCase().trim();

  console.error(`[Relay] RESOLVE "${to}" → key="${key}"`);

  // Exact relayId match
  if (subscribers.has(key)) {
    console.error(`[Relay] RESOLVE → exact match: ${key}`);
    return { id: key, entry: subscribers.get(key) };
  }

  // name@project or name/role@project match
  if (key.includes('@')) {
    const [nameOrRole, project] = key.split('@');
    const name = nameOrRole.includes('/') ? nameOrRole.split('/')[0] : nameOrRole;
    console.error(`[Relay] RESOLVE → @project: name="${name}" project="${project}"`);
    const matches = [];
    for (const [id, entry] of subscribers) {
      const eName = entry.meta?.name?.toLowerCase();
      const eProject = entry.meta?.project?.toLowerCase();
      if (eName === name && eProject === project) {
        matches.push({ id, entry });
      }
    }
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      console.error(`[Relay] RESOLVE → AMBIGUOUS: ${matches.length} matches for ${key}`);
      return null;
    }
    console.error(`[Relay] RESOLVE → NOT FOUND for ${key}`);
    return null;
  }

  // Bare name — match first agent with that name
  const matches = [];
  for (const [id, entry] of subscribers) {
    if (entry.meta?.name?.toLowerCase() === key) {
      matches.push({ id, entry });
    }
  }

  if (matches.length === 1) {
    console.error(`[Relay] RESOLVE → bare name unique: ${matches[0].id}`);
    return matches[0];
  }
  if (matches.length > 1) {
    console.error(`[Relay] RESOLVE → AMBIGUOUS: ${matches.length} agents named "${key}": ${matches.map(m => m.id).join(', ')}`);
    return null;
  }

  console.error(`[Relay] RESOLVE → NOT FOUND: "${key}"`);
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
    } catch (e) {
      console.error(`[Relay] SUBSCRIBE WARNING: failed to parse meta for ${relayId}: ${e.message}`);
    }

    if (!relayId) {
      console.error(`[Relay] SUBSCRIBE ERROR: empty relay ID`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing relay ID' }));
      return;
    }

    // Close previous connection for same relay ID
    const existing = subscribers.get(relayId);
    if (existing) {
      clearInterval(existing.keepaliveInterval);
      try { existing.res.end(); } catch (e) {
        console.error(`[Relay] SUBSCRIBE WARNING: failed to close old stream for ${relayId}: ${e.message}`);
      }
      console.error(`[Relay] SUBSCRIBE REPLACE: ${meta.display || relayId} (old writes=${existing.writeCount})`);
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const connectWrite = res.write(': connected\n\n');
    if (!connectWrite) {
      console.error(`[Relay] SUBSCRIBE ERROR: initial write returned false for ${relayId} — stream may be broken`);
    }

    const keepaliveInterval = setInterval(() => {
      try {
        const ok = res.write(': keepalive\n\n');
        if (!ok) {
          console.error(`[Relay] KEEPALIVE BACKPRESSURE on ${meta.display || relayId} — stream congested`);
        }
      } catch (e) {
        console.error(`[Relay] KEEPALIVE FAILED on ${meta.display || relayId}: ${e.message} — removing`);
        removeSubscriber(relayId);
      }
    }, KEEPALIVE_INTERVAL_MS);

    subscribers.set(relayId, {
      res, path: agentPath, meta, registeredAt: Date.now(), keepaliveInterval,
      writeCount: 0, lastWriteAt: null, lastSentAt: null, status: 'idle'
    });
    console.error(`[Relay] SUBSCRIBE OK: ${meta.display || relayId} (${agentPath}) [total=${subscribers.size}]`);

    req.on('close', () => {
      console.error(`[Relay] STREAM CLOSED by client: ${meta.display || relayId}`);
      removeSubscriber(relayId);
    });
    return;
  }

  // --- Send message: POST /send ---
  if (req.method === 'POST' && url.pathname === '/send') {
    let body = '';
    for await (const chunk of req) body += chunk;

    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      console.error(`[Relay] SEND ERROR: invalid JSON: ${e.message}`);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { from, from_display, from_path, to, message, whisper } = payload;

    // Track sender activity
    if (from) {
      const senderKey = from.toLowerCase().trim();
      const sender = subscribers.get(senderKey);
      if (sender) sender.lastSentAt = Date.now();
    }

    if (!to || !message) {
      console.error(`[Relay] SEND ERROR: missing "to" or "message"`);
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
      console.error(`[Relay] SEND FAIL: "${to}" not resolved. Online: ${online.map(o => o.display).join(', ')}`);
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

    const ssePayload = `data: ${event}\n\n`;

    try {
      const writeOk = target.res.write(ssePayload);
      target.writeCount++;
      target.lastWriteAt = Date.now();

      if (!writeOk) {
        console.error(`[Relay] SEND BACKPRESSURE: write to ${target.meta?.display || targetId} returned false — stream congested, message may be queued`);
      }

      // Record in project history (unless whisper)
      if (!whisper) {
        const senderEntry = from ? subscribers.get(from.toLowerCase().trim()) : null;
        const project = target.meta?.project || senderEntry?.meta?.project;
        pushHistory(project, {
          from: from_display || from || 'unknown',
          to: target.meta?.display || targetId,
          message
        });
      }

      console.error(`[Relay] SEND OK: ${from_display || from || '?'} → ${target.meta?.display || targetId} (write #${target.writeCount}, ok=${writeOk}, bytes=${ssePayload.length})`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sent: true, to: targetId, to_display: target.meta?.display, writeOk }));
    } catch (e) {
      console.error(`[Relay] SEND EXCEPTION: write to ${target.meta?.display || targetId} threw: ${e.message} — removing subscriber`);
      removeSubscriber(targetId);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Failed to deliver to "${to}": ${e.message}` }));
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
        job: entry.meta?.job || '',
        project: entry.meta?.project || '',
        display: entry.meta?.display || id,
        path: entry.path,
        writeCount: entry.writeCount,
        lastWriteAt: entry.lastWriteAt,
        lastSentAt: entry.lastSentAt,
        status: entry.status || 'idle',
        registeredAt: entry.registeredAt
      });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents, count: agents.length }));
    return;
  }

  // --- Set status: POST /status ---
  if (req.method === 'POST' && url.pathname === '/status') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    const { from, status: newStatus } = payload;
    const validStatuses = ['working', 'idle', 'blocked'];
    if (!from || !newStatus || !validStatuses.includes(newStatus)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Requires "from" and "status" (${validStatuses.join('|')})` }));
      return;
    }

    const senderKey = from.toLowerCase().trim();
    const entry = subscribers.get(senderKey);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Agent "${from}" not found` }));
      return;
    }

    entry.status = newStatus;
    console.error(`[Relay] STATUS ${entry.meta?.display || from} → ${newStatus}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ set: true, agent: entry.meta?.display || from, status: newStatus }));
    return;
  }

  // --- History: GET /history/:project?last=N ---
  if (req.method === 'GET' && url.pathname.startsWith('/history/')) {
    const project = decodeURIComponent(url.pathname.slice('/history/'.length)).toLowerCase().trim();
    const last = Math.min(parseInt(url.searchParams.get('last') || '20', 10), 50);
    const buf = history.get(project) || [];
    const messages = buf.slice(-last);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ project, messages, count: messages.length }));
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
