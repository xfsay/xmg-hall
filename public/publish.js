const form = document.getElementById('publish-form');
const toastEl = document.getElementById('toast');
const modal = document.getElementById('success-modal');
const continueBtn = document.getElementById('continue-publish');
const backBtn = document.getElementById('back-hall');

let myTokens = loadJson('myTokens', {});

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

function showToast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  window.clearTimeout(toastEl.hideTimer);
  toastEl.hideTimer = window.setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

function showModal() {
  modal.hidden = false;
}

function hideModal() {
  modal.hidden = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const price = document.getElementById('price').value.trim();
  const code = document.getElementById('code').value.trim();

  if (!price || !code) {
    showToast('请填写价格和口令', true);
    return;
  }

  try {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price, code })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || '发布失败', true);
      return;
    }
    myTokens[data.item.id] = data.deleteToken;
    saveJson('myTokens', myTokens);
    form.reset();
    showModal();
  } catch (err) {
    showToast('发布失败，请稍后重试', true);
  }
});

continueBtn.addEventListener('click', () => {
  hideModal();
  document.getElementById('price').focus();
});

backBtn.addEventListener('click', () => {
  window.location.href = '/';
});

modal.addEventListener('click', (event) => {
  if (event.target.classList.contains('modal-backdrop')) {
    hideModal();
  }
});
