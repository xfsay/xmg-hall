const itemsEl = document.getElementById('items');
const toastEl = document.getElementById('toast');
const statCountEl = document.getElementById('stat-count');
const statCountdownEl = document.getElementById('stat-countdown');
const refreshBtn = document.getElementById('refresh');
const announcementSection = document.getElementById('announcement');
const announcementTextEl = document.getElementById('announcement-text');
const announcementTimeEl = document.getElementById('announcement-time');

const reporterId = getOrCreateReporterId();
let myTokens = loadJson('myTokens', {});
let reportedIds = loadJson('reportedIds', []);
let countdownTimer = null;
let countdownSeconds = 0;

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getOrCreateReporterId() {
  let id = localStorage.getItem('reporterId');
  if (id) {
    return id;
  }
  if (crypto && crypto.randomUUID) {
    id = crypto.randomUUID();
  } else {
    id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
  localStorage.setItem('reporterId', id);
  return id;
}

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  window.clearTimeout(toastEl.hideTimer);
  toastEl.hideTimer = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const secs = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(ts) {
  const date = new Date(ts);
  return date.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) {
      throw new Error('Stats failed');
    }
    const data = await res.json();
    statCountEl.textContent = data.countToday;
    startCountdown(data.secondsToMidnight);
  } catch (err) {
    showToast('统计获取失败，请稍后重试', true);
  }
}

function startCountdown(seconds) {
  countdownSeconds = seconds;
  statCountdownEl.textContent = formatCountdown(countdownSeconds);
  if (countdownTimer) {
    window.clearInterval(countdownTimer);
  }
  countdownTimer = window.setInterval(() => {
    countdownSeconds -= 1;
    if (countdownSeconds <= 0) {
      countdownSeconds = 0;
      statCountdownEl.textContent = formatCountdown(countdownSeconds);
      window.clearInterval(countdownTimer);
      countdownTimer = null;
      fetchItems();
      fetchStats();
      return;
    }
    statCountdownEl.textContent = formatCountdown(countdownSeconds);
  }, 1000);
}

async function fetchItems() {
  try {
    const res = await fetch('/api/items');
    if (!res.ok) {
      throw new Error('Items failed');
    }
    const data = await res.json();
    renderItems(data.items || []);
  } catch (err) {
    showToast('大厅列表获取失败，请稍后重试', true);
  }
}

async function fetchAnnouncement() {
  try {
    const res = await fetch('/api/announcement');
    if (!res.ok) {
      throw new Error('Announcement failed');
    }
    const data = await res.json();
    const announcement = data.announcement;
    if (announcement && announcement.text) {
      announcementTextEl.textContent = announcement.text;
      if (announcement.updatedAt) {
        announcementTimeEl.textContent = `更新于 ${formatDateTime(announcement.updatedAt)}`;
      } else {
        announcementTimeEl.textContent = '';
      }
      announcementSection.hidden = false;
    } else {
      announcementSection.hidden = true;
      announcementTextEl.textContent = '';
      announcementTimeEl.textContent = '';
    }
  } catch (err) {
    announcementSection.hidden = true;
  }
}

function renderItems(items) {
  itemsEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '今天还没有口令，快来发布第一条吧。';
    itemsEl.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const card = document.createElement('article');
    card.className = 'item';

    const head = document.createElement('div');
    head.className = 'item-head';

    const price = document.createElement('div');
    price.className = 'price';
    price.textContent = `价格：${item.price}`;

    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = `发布于 ${formatTime(item.createdAt)}`;

    head.appendChild(price);
    head.appendChild(time);

    const code = document.createElement('pre');
    code.className = 'code';
    code.textContent = item.code;

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    meta.textContent = `已复制 ${item.copyCount || 0} 次`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn primary';
    copyBtn.textContent = '复制口令';
    copyBtn.addEventListener('click', async () => {
      const copied = await copyToClipboard(item.code);
      if (!copied) {
        showToast('复制失败，请手动选择口令', true);
        return;
      }
      try {
        const res = await fetch(`/api/items/${item.id}/copy`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          meta.textContent = `已复制 ${data.copyCount} 次`;
          showToast('口令已复制');
        } else {
          showToast(data.error || '复制统计失败', true);
        }
      } catch (err) {
        showToast('复制统计失败，请稍后重试', true);
      }
    });

    const reportBtn = document.createElement('button');
    reportBtn.className = 'btn ghost';
    const alreadyReported = reportedIds.includes(item.id);
    reportBtn.textContent = alreadyReported ? '已举报' : '举报';
    reportBtn.disabled = alreadyReported;
    reportBtn.addEventListener('click', async () => {
      if (reportBtn.disabled) {
        return;
      }
      try {
        const res = await fetch(`/api/items/${item.id}/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reporterId })
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || '举报失败', true);
          return;
        }
        if (!reportedIds.includes(item.id)) {
          reportedIds.push(item.id);
          saveJson('reportedIds', reportedIds);
        }
        reportBtn.textContent = '已举报';
        reportBtn.disabled = true;
        showToast('已提交举报');
      } catch (err) {
        showToast('举报失败，请稍后重试', true);
      }
    });

    actions.appendChild(copyBtn);
    actions.appendChild(reportBtn);

    const token = myTokens[item.id];
    if (token) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn danger';
      deleteBtn.textContent = '删除';
      deleteBtn.addEventListener('click', async () => {
        const confirmed = window.confirm('确定删除这条口令吗？');
        if (!confirmed) {
          return;
        }
        try {
          const res = await fetch(`/api/items/${item.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || '删除失败', true);
            return;
          }
          delete myTokens[item.id];
          saveJson('myTokens', myTokens);
          showToast('已删除');
          fetchItems();
          fetchStats();
        } catch (err) {
          showToast('删除失败，请稍后重试', true);
        }
      });
      actions.appendChild(deleteBtn);
    }

    card.appendChild(head);
    card.appendChild(code);
    card.appendChild(meta);
    card.appendChild(actions);

    itemsEl.appendChild(card);
  });
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) {
    // Fallback below.
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch (err) {
    document.body.removeChild(textarea);
    return false;
  }
}

refreshBtn.addEventListener('click', () => {
  fetchItems();
  fetchStats();
  fetchAnnouncement();
});

fetchItems();
fetchStats();
fetchAnnouncement();
window.setInterval(fetchItems, 20000);
