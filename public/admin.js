const itemsEl = document.getElementById('admin-items');
const toastEl = document.getElementById('toast');
const userInput = document.getElementById('admin-user');
const passInput = document.getElementById('admin-pass');
const loadBtn = document.getElementById('load');
const refreshBtn = document.getElementById('refresh');
const announcementInput = document.getElementById('announcement-text');
const publishAnnouncementBtn = document.getElementById('publish-announcement');
const clearAnnouncementBtn = document.getElementById('clear-announcement');
const announcementStatus = document.getElementById('announcement-status');
const adminSections = document.getElementById('admin-sections');

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  window.clearTimeout(toastEl.hideTimer);
  toastEl.hideTimer = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

function formatTime(ts) {
  const date = new Date(ts);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getAuthHeader() {
  const user = userInput.value.trim();
  const pass = passInput.value.trim();
  if (!user || !pass) {
    return '';
  }
  return `Basic ${toBase64(`${user}:${pass}`)}`;
}

async function loadReports() {
  const user = userInput.value.trim();
  const pass = passInput.value.trim();
  if (!user || !pass) {
    showToast('请输入管理员账号和密码', true);
    if (adminSections) {
      adminSections.hidden = true;
    }
    return;
  }
  const authHeader = getAuthHeader();

  try {
    const res = await fetch('/api/admin/reports', {
      headers: { Authorization: authHeader }
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '加载失败', true);
      if (adminSections) {
        adminSections.hidden = true;
      }
      return;
    }
    renderReports(data.items || []);
    await loadAnnouncement();
    if (adminSections) {
      adminSections.hidden = false;
    }
  } catch (err) {
    showToast('加载失败，请稍后重试', true);
    if (adminSections) {
      adminSections.hidden = true;
    }
  }
}

function renderReports(items) {
  itemsEl.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '暂无举报记录。';
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
    meta.textContent = `举报 ${item.reportCount || 0} 次 · 已复制 ${item.copyCount || 0} 次`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.textContent = '删除口令';
    deleteBtn.addEventListener('click', async () => {
      const confirmed = window.confirm('确定删除这条口令吗？');
      if (!confirmed) {
        return;
      }
      const authHeader = getAuthHeader();
      if (!authHeader) {
        showToast('请输入管理员账号和密码', true);
        return;
      }
      try {
        const res = await fetch(`/api/admin/items/${item.id}`, {
          method: 'DELETE',
          headers: { Authorization: authHeader }
        });
        const data = await res.json();
        if (!res.ok) {
          showToast(data.error || '删除失败', true);
          return;
        }
        showToast('已删除');
        loadReports();
      } catch (err) {
        showToast('删除失败，请稍后重试', true);
      }
    });

    actions.appendChild(deleteBtn);

    card.appendChild(head);
    card.appendChild(code);
    card.appendChild(meta);
    card.appendChild(actions);

    itemsEl.appendChild(card);
  });
}

async function loadAnnouncement() {
  try {
    const res = await fetch('/api/announcement');
    const data = await res.json();
    if (!res.ok) {
      return;
    }
    const announcement = data.announcement;
    if (announcement && announcement.text) {
      announcementInput.value = announcement.text;
      const time = announcement.updatedAt ? formatTime(announcement.updatedAt) : '';
      announcementStatus.textContent = time ? `当前公告已发布（${time}）` : '当前公告已发布';
    } else {
      announcementStatus.textContent = '当前无公告';
      announcementInput.value = '';
    }
  } catch (err) {
    // ignore
  }
}

async function publishAnnouncement(clear = false) {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    showToast('请输入管理员账号和密码', true);
    return;
  }
  const text = clear ? '' : announcementInput.value.trim();
  if (!clear && !text) {
    showToast('请输入公告内容', true);
    return;
  }
  try {
    const res = await fetch('/api/admin/announcement', {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '公告发布失败', true);
      return;
    }
    showToast(clear ? '公告已清空' : '公告已发布');
    await loadAnnouncement();
  } catch (err) {
    showToast('公告发布失败，请稍后重试', true);
  }
}

loadBtn.addEventListener('click', loadReports);
refreshBtn.addEventListener('click', loadReports);
publishAnnouncementBtn.addEventListener('click', () => publishAnnouncement(false));
clearAnnouncementBtn.addEventListener('click', () => publishAnnouncement(true));

if (adminSections) {
  adminSections.hidden = true;
}

function toBase64(value) {
  try {
    return btoa(unescape(encodeURIComponent(value)));
  } catch (err) {
    return btoa(value);
  }
}
