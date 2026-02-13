const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const ADMIN_PAGE_PATH = path.join(__dirname, 'private', 'admin.html');
const DECOY_PAGE_PATH = path.join(__dirname, 'private', 'decoy.html');
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function secondsToMidnight(date = new Date()) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, Math.floor((next - date) / 1000));
}

function writeDb(next) {
  ensureDir();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

function loadDb() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    const fresh = { dayKey: getDayKey(), items: [], announcement: null };
    writeDb(fresh);
    return fresh;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid DB format');
    }
    parsed.dayKey = parsed.dayKey || getDayKey();
    parsed.items = Array.isArray(parsed.items) ? parsed.items : [];
    parsed.announcement = parsed.announcement || null;
    return parsed;
  } catch (err) {
    const badPath = `${DB_PATH}.bad-${Date.now()}`;
    fs.renameSync(DB_PATH, badPath);
    const fresh = { dayKey: getDayKey(), items: [], announcement: null };
    writeDb(fresh);
    return fresh;
  }
}

let db = loadDb();

function ensureDay() {
  const key = getDayKey();
  if (db.dayKey !== key) {
    db = { dayKey: key, items: [], announcement: db.announcement || null };
    writeDb(db);
  }
}

function scheduleMidnightClear() {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const delay = Math.max(1000, next - now + 50);
  setTimeout(() => {
    ensureDay();
    scheduleMidnightClear();
  }, delay);
}

function publicItem(item) {
  return {
    id: item.id,
    price: item.price,
    code: item.code,
    createdAt: item.createdAt,
    copyCount: item.copyCount || 0,
    reportCount: item.reportCount || 0
  };
}

function isAdmin(req) {
  if (ADMIN_USER && ADMIN_PASS) {
    const auth = req.get('Authorization') || '';
    if (!auth.startsWith('Basic ')) {
      return false;
    }
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const sepIndex = decoded.indexOf(':');
    if (sepIndex === -1) {
      return false;
    }
    const user = decoded.slice(0, sepIndex);
    const pass = decoded.slice(sepIndex + 1);
    return user === ADMIN_USER && pass === ADMIN_PASS;
  }
  const key = req.get('X-Admin-Key') || req.query.key || '';
  return Boolean(ADMIN_KEY) && key === ADMIN_KEY;
}


app.use(express.json({ limit: '64kb' }));

app.use((req, res, next) => {
  ensureDay();
  next();
});

app.get('/api/items', (req, res) => {
  const items = [...db.items]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicItem);
  res.json({ items, dayKey: db.dayKey });
});

app.post('/api/items', (req, res) => {
  const price = String(req.body.price || '').trim();
  const code = String(req.body.code || '').trim();

  if (!price || !code) {
    return res.status(400).json({ error: 'Price and code are required.' });
  }
  if (price.length > 30 || code.length > 200) {
    return res.status(400).json({ error: 'Input is too long.' });
  }

  const item = {
    id: crypto.randomUUID(),
    price,
    code,
    createdAt: Date.now(),
    copyCount: 0,
    reportCount: 0,
    reporters: [],
    deleteToken: crypto.randomUUID()
  };

  db.items.push(item);
  writeDb(db);

  res.json({ item: publicItem(item), deleteToken: item.deleteToken });
});

app.delete('/api/items/:id', (req, res) => {
  const token = String(req.body.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Delete token required.' });
  }

  const index = db.items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  const item = db.items[index];
  if (item.deleteToken !== token) {
    return res.status(403).json({ error: 'Invalid delete token.' });
  }

  db.items.splice(index, 1);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/items/:id/copy', (req, res) => {
  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  item.copyCount = (item.copyCount || 0) + 1;
  writeDb(db);
  res.json({ copyCount: item.copyCount });
});

app.post('/api/items/:id/report', (req, res) => {
  const reporterId = String(req.body.reporterId || '').trim();
  if (!reporterId) {
    return res.status(400).json({ error: 'Reporter id required.' });
  }

  const item = db.items.find((entry) => entry.id === req.params.id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  item.reporters = Array.isArray(item.reporters) ? item.reporters : [];
  if (item.reporters.includes(reporterId)) {
    return res.json({ reportCount: item.reportCount || 0, alreadyReported: true });
  }

  item.reporters.push(reporterId);
  item.reportCount = (item.reportCount || 0) + 1;
  writeDb(db);
  res.json({ reportCount: item.reportCount });
});

app.get('/api/stats', (req, res) => {
  res.json({
    countToday: db.items.length,
    secondsToMidnight: secondsToMidnight(),
    serverTime: Date.now(),
    dayKey: db.dayKey
  });
});

app.get('/api/announcement', (req, res) => {
  res.json({ announcement: db.announcement || null });
});

app.post('/api/admin/announcement', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin auth invalid.' });
  }

  const text = String(req.body.text || '').trim();
  if (!text) {
    db.announcement = null;
    writeDb(db);
    return res.json({ announcement: null });
  }
  if (text.length > 500) {
    return res.status(400).json({ error: 'Announcement too long.' });
  }
  db.announcement = {
    text,
    updatedAt: Date.now()
  };
  writeDb(db);
  res.json({ announcement: db.announcement });
});

app.get('/api/admin/reports', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin auth invalid.' });
  }

  const items = db.items
    .filter((item) => (item.reportCount || 0) > 0)
    .sort((a, b) => (b.reportCount || 0) - (a.reportCount || 0))
    .map(publicItem);

  res.json({ items, dayKey: db.dayKey });
});

app.delete('/api/admin/items/:id', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Admin auth invalid.' });
  }

  const index = db.items.findIndex((item) => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found.' });
  }

  db.items.splice(index, 1);
  writeDb(db);
  res.json({ ok: true });
});

app.get('/xmg-7f3', (req, res) => {
  res.sendFile(ADMIN_PAGE_PATH);
});

app.get('/xmg-7f3/', (req, res) => {
  res.redirect(301, '/xmg-7f3');
});

app.get(['/admin', '/Admin'], (req, res) => {
  res.sendFile(DECOY_PAGE_PATH);
});

app.get(['/admin/', '/Admin/'], (req, res) => {
  res.redirect(302, '/admin');
});

app.get('/admin.html', (req, res) => {
  res.status(404).send('Not found');
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  scheduleMidnightClear();
  console.log(`Server running on port ${PORT}`);
});
