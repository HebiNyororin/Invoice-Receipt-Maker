import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Password Protection Settings
const CORRECT_PASSWORD = 'Bemine_23rd';
const AUTH_TOKEN_KEY = 'elpis_auth_token_2026';

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  checkAuthOnLoad();
  setupDocumentToggle();
  setupSynchronizations();
  setupInvoiceItems();
  setDefaultDates();
  
  // PDF ダウンロードボタン
  document.getElementById('btn-print').addEventListener('click', async () => {
    autoSaveWithoutAlert();

    // アクティブなプレビュー要素を取得
    const mode = document.querySelector('input[name="doc-mode"]:checked')?.value || 'invoice';
    const previewId = mode === 'invoice' ? 'invoice-preview' : 'receipt-preview';
    const element = document.getElementById(previewId);
    if (!element) return;

    // ファイル名：宛名＋書類種別＋日付
    const toName = (mode === 'invoice'
      ? document.getElementById('inv-to-name')?.value
      : document.getElementById('rec-to-name')?.value) || '宛名なし';
    const docLabel = mode === 'invoice' ? '請求書' : '領収書';
    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `${toName}_${docLabel}_${dateStr}.pdf`;

    const opt = {
      margin:       0,
      filename:     filename,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { 
        scale: 2, 
        useCORS: true, 
        letterRendering: true
      },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    showToast('PDF を生成中...');
    
    // 一時的にPDF出力用スタイルを適用して、画面内の実要素を等倍A4+美しい20mm余白に固定
    document.body.classList.add('pdf-exporting');

    try {
      await html2pdf().set(opt).from(element).save();
      showToast(`📄 ${filename} をダウンロードしました！`);
    } catch(e) {
      console.error('PDF generation failed:', e);
      showToast('PDF の生成に失敗しました。');
    } finally {
      // 元のスマホ表示に戻す
      document.body.classList.remove('pdf-exporting');
    }
  });

  // Set up logout button
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Set up history module controls
  document.getElementById('btn-save-doc').addEventListener('click', saveCurrentDocument);

  // Mobile action bar buttons (mirror header buttons)
  const mobSave = document.getElementById('mob-btn-save');
  const mobPdf  = document.getElementById('mob-btn-pdf');
  if (mobSave) mobSave.addEventListener('click', () => document.getElementById('btn-save-doc').click());
  if (mobPdf)  mobPdf.addEventListener('click',  () => document.getElementById('btn-print').click());
  
  // Load and render history logs (local server sync when available)
  initHistoryAndAutoNumbers();

  // Supabase Settings Modal Triggers
  const modal    = document.getElementById('supabase-modal');
  const urlInput = document.getElementById('supabase-url-input');
  const keyInput = document.getElementById('supabase-key-input');

  const btnSettingsEl = document.getElementById('btn-supabase-settings');
  if (btnSettingsEl) {
    btnSettingsEl.addEventListener('click', () => {
      urlInput.value = localStorage.getItem('dekitalab_supabase_url') || '';
      keyInput.value = localStorage.getItem('dekitalab_supabase_key') || '';
      initSupabase();
      modal.style.display = 'flex';
    });
  }

  const btnCloseEl = document.getElementById('btn-supabase-close');
  if (btnCloseEl) btnCloseEl.addEventListener('click', () => { modal.style.display = 'none'; });

  const btnSaveEl = document.getElementById('btn-supabase-save');
  if (btnSaveEl) {
    btnSaveEl.addEventListener('click', async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      if (!url || !key) {
        localStorage.removeItem('dekitalab_supabase_url');
        localStorage.removeItem('dekitalab_supabase_key');
        supabase = null;
        initSupabase();
        showToast('設定を消去しました。ローカル保存のみで動作します。');
        modal.style.display = 'none';
        return;
      }
      if (!url.startsWith('https://')) { showToast('Project URL は https:// で始まる必要があります。'); return; }
      localStorage.setItem('dekitalab_supabase_url', url);
      localStorage.setItem('dekitalab_supabase_key', key);
      initSupabase();
      showToast('Supabase の設定を保存しました！');
      modal.style.display = 'none';
      initHistoryAndAutoNumbers();
    });
  }
});

// --- AUTHENTICATION MODULE ---

function checkAuthOnLoad() {
  const params = new URLSearchParams(window.location.search);
  const authQuery = params.get('auth');
  
  if (authQuery === 'Bemine_23rd') {
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
    showApp();
    return;
  }
  
  const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  if (token === 'authenticated') {
    showApp();
  } else {
    showLogin();
  }
}

window.checkPassword = function() {
  const passwordInput = document.getElementById('password-input');
  const rememberMe = document.getElementById('remember-me');
  const errorText = document.getElementById('password-error');
  
  if (passwordInput.value === CORRECT_PASSWORD) {
    errorText.style.display = 'none';
    
    // Set authentication token
    sessionStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
    if (rememberMe.checked) {
      localStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
    }
    
    passwordInput.value = '';
    showApp();
  } else {
    errorText.style.display = 'block';
    passwordInput.value = '';
    passwordInput.focus();
  }
};

function logout() {
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
  showLogin();
}

function showApp() {
  document.getElementById('password-overlay').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
}

function showLogin() {
  document.getElementById('app-container').style.display = 'none';
  document.getElementById('password-overlay').style.display = 'flex';
}


// --- DOCUMENT TOGGLE MODULE (Invoice vs Receipt) ---

function setupDocumentToggle() {
  const radios = document.querySelectorAll('input[name="doc-mode"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      
      const invoiceControls = document.getElementById('controls-invoice');
      const receiptControls = document.getElementById('controls-receipt');
      const invoicePreview = document.getElementById('invoice-preview');
      const receiptPreview = document.getElementById('receipt-preview');

      if (mode === 'invoice') {
        invoiceControls.style.display = 'block';
        receiptControls.style.display = 'none';
        invoicePreview.style.display = 'block';
        receiptPreview.style.display = 'none';
        updateInvoicePreview();
      } else {
        invoiceControls.style.display = 'none';
        receiptControls.style.display = 'block';
        invoicePreview.style.display = 'none';
        receiptPreview.style.display = 'block';
        updateReceiptPreview();
      }
    });
  });
}


// --- SYNCHRONIZATION MODULE ---

function setupSynchronizations() {
  // --- Invoice Sync ---
  const invoiceSyncFields = [
    { inputId: 'inv-title', viewId: 'view-inv-title' },
    { inputId: 'inv-number', viewId: 'view-inv-number' },
    { inputId: 'inv-date', viewId: 'view-inv-date', formatter: formatDateString },
    { inputId: 'inv-due-date', viewId: 'view-inv-due-date', formatter: formatDateString },
    { inputId: 'inv-to-name', viewId: 'view-inv-to-name' },
    { inputId: 'inv-subject', viewId: 'view-inv-subject' },
    { inputId: 'inv-from-company', viewId: 'view-inv-from-company' },
    { inputId: 'inv-from-name', viewId: 'view-inv-from-name' },
    { inputId: 'inv-from-contact', viewId: 'view-inv-from-contact' },
    { inputId: 'inv-from-phone', viewId: 'view-inv-from-phone' },
    { inputId: 'inv-from-address', viewId: 'view-inv-from-address' },
    { inputId: 'inv-remarks', viewId: 'view-inv-remarks' }
  ];

  invoiceSyncFields.forEach(field => {
    const input = document.getElementById(field.inputId);
    const view = document.getElementById(field.viewId);
    if (input && view) {
      input.addEventListener('input', () => {
        view.textContent = field.formatter ? field.formatter(input.value) : input.value;
      });
    }
  });

  // --- Receipt Sync ---
  const receiptSyncFields = [
    { inputId: 'rcpt-title', viewId: 'view-rcpt-title' },
    { inputId: 'rcpt-number', viewId: 'view-rcpt-number' },
    { inputId: 'rcpt-date', viewId: 'view-rcpt-date', formatter: formatDateString },
    { inputId: 'rcpt-to-name', viewId: 'view-rcpt-to-name' },
    { inputId: 'rcpt-amount', viewId: 'view-rcpt-amount', formatter: formatCurrencyString },
    { inputId: 'rcpt-amount', viewId: 'view-rcpt-breakdown-amount', formatter: formatCurrencySimple },
    { inputId: 'rcpt-subject', viewId: 'view-rcpt-subject' },
    { inputId: 'rcpt-proviso', viewId: 'view-rcpt-proviso' },
    { inputId: 'rcpt-from-company', viewId: 'view-rcpt-from-company-bold' },
    { inputId: 'rcpt-from-company', viewId: 'view-rcpt-from-company-logo' },
    { inputId: 'rcpt-from-name', viewId: 'view-rcpt-from-name-r' },
    { inputId: 'rcpt-from-phone', viewId: 'view-rcpt-from-phone-r' },
    { inputId: 'rcpt-from-address', viewId: 'view-rcpt-from-address-r', isHTML: true },
    { inputId: 'rcpt-from-contact', viewId: 'view-rcpt-from-contact-r' }
  ];

  receiptSyncFields.forEach(field => {
    const input = document.getElementById(field.inputId);
    const view = document.getElementById(field.viewId);
    if (input && view) {
      input.addEventListener('input', () => {
        if (field.isHTML) {
          view.innerHTML = input.value.replace(/\n/g, '<br>');
        } else {
          view.textContent = field.formatter ? field.formatter(input.value) : input.value;
        }
      });
    }
  });
}

// Formatters
function formatDateString(val) {
  if (!val) return '----.--.--';
  return val.replace(/-/g, '.');
}

function formatDateStringJP(val) {
  if (!val) return '----年--月--日';
  const parts = val.split('-');
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
  }
  return val;
}

function formatCurrencyString(val) {
  if (!val) return '¥0-';
  const num = parseInt(val, 10);
  if (isNaN(num)) return '¥0-';
  return `¥${num.toLocaleString()}-`;
}

function formatCurrencySimple(val) {
  if (!val) return '¥0';
  const num = parseInt(val, 10);
  if (isNaN(num)) return '¥0';
  return `¥${num.toLocaleString()}`;
}

// Initial full updates
function updateInvoicePreview() {
  const invoiceSyncFields = [
    { inputId: 'inv-title', viewId: 'view-inv-title' },
    { inputId: 'inv-number', viewId: 'view-inv-number' },
    { inputId: 'inv-date', viewId: 'view-inv-date', formatter: formatDateString },
    { inputId: 'inv-due-date', viewId: 'view-inv-due-date', formatter: formatDateString },
    { inputId: 'inv-to-name', viewId: 'view-inv-to-name' },
    { inputId: 'inv-subject', viewId: 'view-inv-subject' },
    { inputId: 'inv-from-company', viewId: 'view-inv-from-company' },
    { inputId: 'inv-from-name', viewId: 'view-inv-from-name' },
    { inputId: 'inv-from-contact', viewId: 'view-inv-from-contact' },
    { inputId: 'inv-from-phone', viewId: 'view-inv-from-phone' },
    { inputId: 'inv-from-address', viewId: 'view-inv-from-address' },
    { inputId: 'inv-remarks', viewId: 'view-inv-remarks' }
  ];

  invoiceSyncFields.forEach(field => {
    const input = document.getElementById(field.inputId);
    const view = document.getElementById(field.viewId);
    if (input && view) {
      view.textContent = field.formatter ? field.formatter(input.value) : input.value;
    }
  });

  recalculateInvoiceTotal();
}

function updateReceiptPreview() {
  const receiptSyncFields = [
    { inputId: 'rcpt-title', viewId: 'view-rcpt-title' },
    { inputId: 'rcpt-number', viewId: 'view-rcpt-number' },
    { inputId: 'rcpt-date', viewId: 'view-rcpt-date', formatter: formatDateString },
    { inputId: 'rcpt-to-name', viewId: 'view-rcpt-to-name' },
    { inputId: 'rcpt-amount', viewId: 'view-rcpt-amount', formatter: formatCurrencyString },
    { inputId: 'rcpt-amount', viewId: 'view-rcpt-breakdown-amount', formatter: formatCurrencySimple },
    { inputId: 'rcpt-subject', viewId: 'view-rcpt-subject' },
    { inputId: 'rcpt-proviso', viewId: 'view-rcpt-proviso' },
    { inputId: 'rcpt-from-company', viewId: 'view-rcpt-from-company-bold' },
    { inputId: 'rcpt-from-company', viewId: 'view-rcpt-from-company-logo' },
    { inputId: 'rcpt-from-name', viewId: 'view-rcpt-from-name-r' },
    { inputId: 'rcpt-from-phone', viewId: 'view-rcpt-from-phone-r' },
    { inputId: 'rcpt-from-address', viewId: 'view-rcpt-from-address-r', isHTML: true },
    { inputId: 'rcpt-from-contact', viewId: 'view-rcpt-from-contact-r' }
  ];

  receiptSyncFields.forEach(field => {
    const input = document.getElementById(field.inputId);
    const view = document.getElementById(field.viewId);
    if (input && view) {
      if (field.isHTML) {
        view.innerHTML = input.value.replace(/\n/g, '<br>');
      } else {
        view.textContent = field.formatter ? field.formatter(input.value) : input.value;
      }
    }
  });
}

function setDefaultDates() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const formattedToday = `${yyyy}-${mm}-${dd}`;

  // Invoice default dates
  document.getElementById('inv-date').value = formattedToday;
  
  // Invoice due date (e.g., end of next month)
  const nextMonthEnd = new Date(yyyy, today.getMonth() + 2, 0);
  const dueYyyy = nextMonthEnd.getFullYear();
  const dueMm = String(nextMonthEnd.getMonth() + 1).padStart(2, '0');
  const dueDd = String(nextMonthEnd.getDate()).padStart(2, '0');
  document.getElementById('inv-due-date').value = `${dueYyyy}-${dueMm}-${dueDd}`;

  // Receipt default date
  document.getElementById('rcpt-date').value = formattedToday;

  // Render previews
  updateInvoicePreview();
  updateReceiptPreview();
}


// --- INVOICE ITEMS MANAGEMENT ---

let invoiceItems = [
  { id: 1, desc: '', date: '', qty: 1, unit: '', price: 0 }
];
let nextItemId = 2;

function setupInvoiceItems() {
  const btnAddItem = document.getElementById('btn-add-item');
  btnAddItem.addEventListener('click', () => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    invoiceItems.push({
      id: nextItemId++,
      desc: '',
      date: formattedDate,
      qty: 1,
      unit: '',
      price: 0
    });
    renderInvoiceItems();
  });

  renderInvoiceItems();
}

function renderInvoiceItems() {
  const container = document.getElementById('invoice-items-edit-container');
  const previewBody = document.getElementById('view-inv-items-body');
  
  container.innerHTML = '';
  previewBody.innerHTML = '';

  invoiceItems.forEach((item, index) => {
    // 1. Render in Editor panel
    const rowEl = document.createElement('div');
    rowEl.className = 'edit-row';
    rowEl.innerHTML = `
      <input type="text" class="item-desc" placeholder="" value="${item.desc}" data-id="${item.id}" title="摘要">
      <div class="edit-row-line-2">
        <input type="date" class="item-date" value="${item.date}" data-id="${item.id}" title="取引日">
        <input type="number" class="item-qty" placeholder="" value="${item.qty}" min="0" step="any" data-id="${item.id}" title="数量">
        <input type="text" class="item-unit" placeholder="" value="${item.unit}" data-id="${item.id}" title="単位">
      </div>
      <div class="edit-row-line-3">
        <input type="number" class="item-price" placeholder="" value="${item.price}" min="0" data-id="${item.id}" title="単価">
        <button type="button" class="btn-remove-row" data-id="${item.id}" title="削除">×</button>
      </div>
    `;

    // Listeners for inputs
    rowEl.querySelector('.item-desc').addEventListener('input', (e) => {
      item.desc = e.target.value;
      updateInvoicePreviewRow(item.id);
    });
    rowEl.querySelector('.item-date').addEventListener('input', (e) => {
      item.date = e.target.value;
      updateInvoicePreviewRow(item.id);
    });
    rowEl.querySelector('.item-qty').addEventListener('input', (e) => {
      item.qty = parseFloat(e.target.value) || 0;
      recalculateItemAmount(item);
      updateInvoicePreviewRow(item.id);
      recalculateInvoiceTotal();
    });
    rowEl.querySelector('.item-unit').addEventListener('input', (e) => {
      item.unit = e.target.value;
      updateInvoicePreviewRow(item.id);
    });
    rowEl.querySelector('.item-price').addEventListener('input', (e) => {
      item.price = parseInt(e.target.value, 10) || 0;
      recalculateItemAmount(item);
      updateInvoicePreviewRow(item.id);
      recalculateInvoiceTotal();
    });
    rowEl.querySelector('.btn-remove-row').addEventListener('click', () => {
      invoiceItems = invoiceItems.filter(i => i.id !== item.id);
      renderInvoiceItems();
    });

    container.appendChild(rowEl);

    // 2. Render in preview table
    const previewRow = document.createElement('tr');
    previewRow.id = `preview-row-${item.id}`;
    
    const amount = item.qty * item.price;
    
    previewRow.innerHTML = `
      <td class="col-desc">${item.desc || ''}</td>
      <td class="col-date">${item.date || ''}</td>
      <td class="col-qty">${item.qty}</td>
      <td class="col-unit">${item.unit}</td>
      <td class="col-price">¥${item.price.toLocaleString()}</td>
      <td class="col-total">¥${amount.toLocaleString()}</td>
    `;
    
    previewBody.appendChild(previewRow);
  });

  recalculateInvoiceTotal();
}

function recalculateItemAmount(item) {
  // Amount calculation is just qty * price
  // The editor updates real-time, no extra storage required except for calculations.
}

function updateInvoicePreviewRow(id) {
  const item = invoiceItems.find(i => i.id === id);
  if (!item) return;

  const previewRow = document.getElementById(`preview-row-${id}`);
  if (previewRow) {
    const amount = item.qty * item.price;
    previewRow.innerHTML = `
      <td class="col-desc">${item.desc || ''}</td>
      <td class="col-date">${item.date || ''}</td>
      <td class="col-qty">${item.qty}</td>
      <td class="col-unit">${item.unit}</td>
      <td class="col-price">¥${item.price.toLocaleString()}</td>
      <td class="col-total">¥${amount.toLocaleString()}</td>
    `;
  }
}

function recalculateInvoiceTotal() {
  let total = 0;
  invoiceItems.forEach(item => {
    total += (item.qty * item.price);
  });

  const totalStr = total.toLocaleString();

  const totalValElement = document.getElementById('view-inv-grand-total');
  if (totalValElement) {
    totalValElement.textContent = totalStr;
  }

  const subtotalValElement = document.getElementById('view-inv-subtotal-val');
  if (subtotalValElement) {
    subtotalValElement.textContent = totalStr;
  }

  const totalGrandBottom = document.getElementById('view-inv-grand-total-bottom');
  if (totalGrandBottom) {
    totalGrandBottom.textContent = totalStr;
  }
}

// --- HISTORY MODULE ---

const HISTORY_KEY = 'dekitalab_document_history_logs_2026';

function getHistory() {
  const data = localStorage.getItem(HISTORY_KEY);
  return data ? JSON.parse(data) : [];
}

function saveHistory(historyList) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(historyList));
  updateAutoNumbers();
  
  if (window.location.protocol.startsWith('http')) {
    fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(historyList)
    }).catch(err => console.error('Failed to sync history to server:', err));
  }
}

function saveCurrentDocument() {
  const mode = document.querySelector('input[name="doc-mode"]:checked').value;
  const history = getHistory();
  
  let docData = {
    id: Date.now(),
    type: mode,
    date: '',
    number: '',
    toName: '',
    amount: 0,
    subject: '',
    payload: {}
  };
  
  if (mode === 'invoice') {
    docData.number = document.getElementById('inv-number').value;
    docData.date = document.getElementById('inv-date').value;
    docData.toName = document.getElementById('inv-to-name').value;
    docData.subject = document.getElementById('inv-subject').value;
    
    // Calculate total amount
    let total = 0;
    invoiceItems.forEach(item => {
      total += (item.qty * item.price);
    });
    docData.amount = total;
    
    // Collect all invoice inputs
    docData.payload = {
      title: document.getElementById('inv-title').value,
      number: docData.number,
      date: docData.date,
      dueDate: document.getElementById('inv-due-date').value,
      toName: docData.toName,
      subject: docData.subject,
      fromCompany: document.getElementById('inv-from-company').value,
      fromName: document.getElementById('inv-from-name').value,
      fromContact: document.getElementById('inv-from-contact').value,
      fromPhone: document.getElementById('inv-from-phone').value,
      fromAddress: document.getElementById('inv-from-address').value,
      remarks: document.getElementById('inv-remarks').value,
      items: JSON.parse(JSON.stringify(invoiceItems))
    };
  } else {
    docData.number = document.getElementById('rcpt-number').value;
    docData.date = document.getElementById('rcpt-date').value;
    docData.toName = document.getElementById('rcpt-to-name').value;
    docData.subject = document.getElementById('rcpt-subject').value;
    
    const amountVal = parseInt(document.getElementById('rcpt-amount').value, 10) || 0;
    docData.amount = amountVal;
    
    // Collect all receipt inputs
    docData.payload = {
      title: document.getElementById('rcpt-title').value,
      number: docData.number,
      date: docData.date,
      toName: docData.toName,
      amount: amountVal,
      subject: docData.subject,
      proviso: document.getElementById('rcpt-proviso').value,
      fromCompany: document.getElementById('rcpt-from-company').value,
      fromName: document.getElementById('rcpt-from-name').value,
      fromContact: document.getElementById('rcpt-from-contact').value,
      fromPhone: document.getElementById('rcpt-from-phone').value,
      fromAddress: document.getElementById('rcpt-from-address').value
    };
  }
  
  // Check if number already exists in history
  const existingIndex = history.findIndex(item => item.type === docData.type && item.number === docData.number);
  if (existingIndex !== -1) {
    if (confirm(`番号「${docData.number}」の履歴が既に存在します。上書きしますか？`)) {
      history[existingIndex] = docData;
    } else {
      return;
    }
  } else {
    history.push(docData);
  }
  
  saveHistory(history);
  upsertSupabaseDoc(docData);
  showToast('履歴に保存しました！');
}

async function deleteHistoryItem(id) {
  if (confirm('この履歴を削除してもよろしいですか？')) {
    const history = getHistory();
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
    await deleteSupabaseDoc(id);
  }
}

function loadHistoryItem(id) {
  const history = getHistory();
  const item = history.find(i => i.id === id);
  if (!item) return;
  
  // Toggle radio button
  const radio = document.querySelector(`input[name="doc-mode"][value="${item.type}"]`);
  if (radio) {
    radio.checked = true;
    // Trigger change event manually
    radio.dispatchEvent(new Event('change'));
  }
  
  const payload = item.payload;
  
  if (item.type === 'invoice') {
    document.getElementById('inv-title').value = payload.title || '請求書';
    document.getElementById('inv-number').value = payload.number || '';
    document.getElementById('inv-date').value = payload.date || '';
    document.getElementById('inv-due-date').value = payload.dueDate || '';
    document.getElementById('inv-to-name').value = payload.toName || '';
    document.getElementById('inv-subject').value = payload.subject || '';
    document.getElementById('inv-from-company').value = payload.fromCompany || '';
    document.getElementById('inv-from-name').value = payload.fromName || '';
    document.getElementById('inv-from-contact').value = payload.fromContact || '';
    document.getElementById('inv-from-phone').value = payload.fromPhone || '';
    document.getElementById('inv-from-address').value = payload.fromAddress || '';
    document.getElementById('inv-remarks').value = payload.remarks || '';
    
    // Restore items
    invoiceItems = JSON.parse(JSON.stringify(payload.items || []));
    if (invoiceItems.length === 0) {
      invoiceItems = [{ id: 1, desc: '', date: '', qty: 1, unit: '', price: 0 }];
    }
    nextItemId = Math.max(...invoiceItems.map(i => i.id), 0) + 1;
    
    renderInvoiceItems();
    updateInvoicePreview();
  } else {
    document.getElementById('rcpt-title').value = payload.title || '領収書';
    document.getElementById('rcpt-number').value = payload.number || '';
    document.getElementById('rcpt-date').value = payload.date || '';
    document.getElementById('rcpt-to-name').value = payload.toName || '';
    document.getElementById('rcpt-amount').value = payload.amount || 0;
    document.getElementById('rcpt-subject').value = payload.subject || '';
    document.getElementById('rcpt-proviso').value = payload.proviso || '';
    document.getElementById('rcpt-from-company').value = payload.fromCompany || '';
    document.getElementById('rcpt-from-name').value = payload.fromName || '';
    document.getElementById('rcpt-from-contact').value = payload.fromContact || '';
    document.getElementById('rcpt-from-phone').value = payload.fromPhone || '';
    document.getElementById('rcpt-from-address').value = payload.fromAddress || '';
    
    updateReceiptPreview();
  }
}

// Note: history listing is now handled in history.html

function autoSaveWithoutAlert() {
  const mode = document.querySelector('input[name="doc-mode"]:checked').value;
  const history = getHistory();
  
  let docData = {
    id: Date.now(),
    type: mode,
    date: '',
    number: '',
    toName: '',
    amount: 0,
    subject: '',
    payload: {}
  };
  
  if (mode === 'invoice') {
    docData.number = document.getElementById('inv-number').value;
    docData.date = document.getElementById('inv-date').value;
    docData.toName = document.getElementById('inv-to-name').value;
    docData.subject = document.getElementById('inv-subject').value;
    
    let total = 0;
    invoiceItems.forEach(item => {
      total += (item.qty * item.price);
    });
    docData.amount = total;
    
    docData.payload = {
      title: document.getElementById('inv-title').value,
      number: docData.number,
      date: docData.date,
      dueDate: document.getElementById('inv-due-date').value,
      toName: docData.toName,
      subject: docData.subject,
      fromCompany: document.getElementById('inv-from-company').value,
      fromName: document.getElementById('inv-from-name').value,
      fromContact: document.getElementById('inv-from-contact').value,
      fromPhone: document.getElementById('inv-from-phone').value,
      fromAddress: document.getElementById('inv-from-address').value,
      remarks: document.getElementById('inv-remarks').value,
      items: JSON.parse(JSON.stringify(invoiceItems))
    };
  } else {
    docData.number = document.getElementById('rcpt-number').value;
    docData.date = document.getElementById('rcpt-date').value;
    docData.toName = document.getElementById('rcpt-to-name').value;
    docData.subject = document.getElementById('rcpt-subject').value;
    
    const amountVal = parseInt(document.getElementById('rcpt-amount').value, 10) || 0;
    docData.amount = amountVal;
    
    docData.payload = {
      title: document.getElementById('rcpt-title').value,
      number: docData.number,
      date: docData.date,
      toName: docData.toName,
      amount: amountVal,
      subject: docData.subject,
      proviso: document.getElementById('rcpt-proviso').value,
      fromCompany: document.getElementById('rcpt-from-company').value,
      fromName: document.getElementById('rcpt-from-name').value,
      fromContact: document.getElementById('rcpt-from-contact').value,
      fromPhone: document.getElementById('rcpt-from-phone').value,
      fromAddress: document.getElementById('rcpt-from-address').value
    };
  }
  
  const existingIndex = history.findIndex(item => item.type === docData.type && item.number === docData.number);
  if (existingIndex !== -1) {
    history[existingIndex] = docData;
  } else {
    history.push(docData);
  }
  
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  upsertSupabaseDoc(docData);
}

function updateAutoNumbers() {
  const history = getHistory();
  
  // 1. Next Invoice Number
  const invoiceLogs = history.filter(item => item.type === 'invoice');
  const invInput = document.getElementById('inv-number');
  if (invInput) {
    // Only update if it's currently default or empty
    if (invInput.value === 'INV-2026-001' || invInput.value === '') {
      if (invoiceLogs.length > 0) {
        invoiceLogs.sort((a, b) => b.id - a.id);
        const lastNumber = invoiceLogs[0].number;
        invInput.value = generateNextSerial(lastNumber, 'INV-2026-001');
      } else {
        invInput.value = 'INV-2026-001';
      }
      invInput.dispatchEvent(new Event('input'));
    }
  }
  
  // 2. Next Receipt Number
  const receiptLogs = history.filter(item => item.type === 'receipt');
  const rcptInput = document.getElementById('rcpt-number');
  if (rcptInput) {
    // Only update if it's currently default or empty
    if (rcptInput.value === '0000001' || rcptInput.value === '') {
      if (receiptLogs.length > 0) {
        receiptLogs.sort((a, b) => b.id - a.id);
        const lastNumber = receiptLogs[0].number;
        rcptInput.value = generateNextSerial(lastNumber, '0000001');
      } else {
        rcptInput.value = '0000001';
      }
      rcptInput.dispatchEvent(new Event('input'));
    }
  }
}

function generateNextSerial(lastNum, defaultVal) {
  if (!lastNum) return defaultVal;
  const match = lastNum.match(/\d+$/);
  if (match) {
    const digitStr = match[0];
    const nextVal = parseInt(digitStr, 10) + 1;
    const padded = String(nextVal).padStart(digitStr.length, '0');
    return lastNum.substring(0, match.index) + padded;
  }
  return defaultVal;
}

// Toast notification helper
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <span class="toast-icon">✓</span>
    <span class="toast-msg">${message}</span>
  `;
  container.appendChild(toast);
  
  let dismissTimer = null;
  
  function startTimer() {
    dismissTimer = setTimeout(() => {
      toast.classList.add('toast-fadeout');
      // Ensure element removal after the 300ms fade transition ends
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2000);
  }
  
  function stopTimer() {
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }
  
  toast.addEventListener('mouseenter', stopTimer);
  toast.addEventListener('mouseleave', startTimer);
  
  startTimer();
}

// ── Supabase integration ─────────────────────────────────────────
let supabase = null;

function initSupabase() {
  const url   = localStorage.getItem('dekitalab_supabase_url');
  const key   = localStorage.getItem('dekitalab_supabase_key');
  const badge = document.getElementById('supabase-status');
  if (url && key) {
    try {
      supabase = createClient(url, key);
      if (badge) { badge.textContent = '接続完了 (Supabase同期中)'; badge.className = 'cloud-status-badge active'; }
    } catch(e) {
      console.error('Supabase init failed:', e);
      if (badge) { badge.textContent = '設定エラー'; badge.className = 'cloud-status-badge inactive'; }
    }
  } else {
    if (badge) { badge.textContent = '未設定 (ローカル保存のみ)'; badge.className = 'cloud-status-badge inactive'; }
  }
}

async function upsertSupabaseDoc(docData) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('history').upsert(docData, { onConflict: 'id' });
    if (error) throw error;
  } catch(err) { console.error('Supabase upsert failed:', err); }
}

async function deleteSupabaseDoc(id) {
  if (!supabase) return;
  try {
    const { error } = await supabase.from('history').delete().eq('id', id);
    if (error) throw error;
  } catch(err) { console.error('Supabase delete failed:', err); }
}

async function initHistoryAndAutoNumbers() {
  initSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('history').select('*');
      if (error) throw error;
      if (data) localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
    } catch(err) {
      console.warn('Failed to load from Supabase:', err);
    }
  }
  checkInitDocLoad();
}

function checkInitDocLoad() {
  const params = new URLSearchParams(window.location.search);
  const loadId = params.get('load_id');
  if (loadId) {
    loadHistoryItem(parseInt(loadId, 10));
  } else {
    updateAutoNumbers();
  }
}

