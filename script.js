/* ==========================================================================
   Babytoy — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลดสินค้า + กรองตาม mood
   - order.html   : เติมฟอร์มจาก URL + ส่งออเดอร์ไป Apps Script
   - admin.html   : แสดงออเดอร์จาก Google Sheet (CSV)
   แต่ละส่วนทำงานเฉพาะเมื่อพบ element ของหน้านั้นๆ
   ========================================================================== */

(() => {
  'use strict';

  /* ---------- ค่าคงที่ ---------- */
  const ORDER_ENDPOINT =
    'https://script.google.com/macros/s/AKfycbyTC_A_Box-d66dgobM6FEHfA3Hx61cVdVcW7sbKUW0AzXsdm0f_jx9OiWsDTaIuGOAEA/exec';

  const ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRorSfNhtkmPKmm-Z-BROnPyflBybpG5qcxu_ARbWeef8S3D2qJWEcON8ba9MECq_NAA9wYM7eNGjZ0/pub?gid=0&single=true&output=csv';

  const MOODS = ['fresh', 'sweet'];

  const $ = (selector, root = document) => root.querySelector(selector);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    const n = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(n) && String(value).trim() !== ''
      ? n.toLocaleString('th-TH')
      : String(value);
  }

  /* ==========================================================================
     1) product.html
     ========================================================================== */
  function initProductPage() {
    const list = $('#product-list');
    if (!list) return;

    const bar = $('#filter-bar');
    const params = new URLSearchParams(window.location.search);
    const moodParam = (params.get('mood') || '').toLowerCase();

    let products = [];
    let currentMood = MOODS.includes(moodParam) ? moodParam : 'all';

    const filters = [
      { key: 'all', label: 'ทั้งหมด' },
      { key: 'fresh', label: 'Fresh' },
      { key: 'sweet', label: 'Sweet' },
    ];

    function buildFilterBar() {
      if (!bar) return;
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'กรองตามกลิ่น');
      bar.textContent = '';

      filters.forEach(({ key, label }) => {
        const btn = el('button', 'btn');
        btn.type = 'button';
        btn.dataset.filter = key;

        if (key !== 'all') {
          btn.dataset.mood = key;
          btn.appendChild(el('span', 'mood-dot'));
        }
        btn.appendChild(document.createTextNode(label));

        btn.addEventListener('click', () => {
          currentMood = key;
          render();
        });
        bar.appendChild(btn);
      });
    }

    function updateFilterState() {
      if (!bar) return;
      bar.querySelectorAll('button').forEach((btn) => {
        const active = btn.dataset.filter === currentMood;
        btn.classList.toggle('btn--solid', active);
        btn.setAttribute('aria-pressed', String(active));
      });
    }

    function buildCard(product) {
      const card = el('article', 'product-card');
      card.dataset.mood = product.mood;

      const media = el('div', 'product-card__media');
      const img = el('img');
      img.src = product.image;
      img.alt = product.name;
      img.loading = 'lazy';
      media.appendChild(img);

      const body = el('div', 'product-card__body');
      body.appendChild(el('h3', 'product-card__title', product.name));
      body.appendChild(el('p', 'product-card__size', product.size));

      const footer = el('div', 'product-card__footer');
      const price = el('span', 'price', formatNumber(product.price));
      price.appendChild(el('small', null, 'บาท'));

      const orderParams = new URLSearchParams({
        item: `${product.name} ${product.size}`,
        price: String(product.price),
      });
      const order = el('a', 'btn btn--accent', 'สั่งซื้อ');
      order.href = `order.html?${orderParams.toString()}`;

      footer.append(price, order);
      body.appendChild(footer);
      card.append(media, body);
      return card;
    }

    function render() {
      updateFilterState();
      list.textContent = '';

      const visible = products.filter(
        (p) => currentMood === 'all' || p.mood === currentMood
      );

      if (visible.length === 0) {
        list.appendChild(el('p', 'muted', 'ยังไม่มีสินค้าในหมวดนี้'));
        return;
      }
      visible.forEach((p) => list.appendChild(buildCard(p)));
    }

    buildFilterBar();
    updateFilterState();

    fetch('products.json')
      .then((res) => {
        if (!res.ok) throw new Error(`โหลด products.json ไม่สำเร็จ (${res.status})`);
        return res.json();
      })
      .then((data) => {
        products = Array.isArray(data) ? data : [];
        render();
      })
      .catch((error) => {
        console.error(error);
        list.textContent = '';
        list.appendChild(el('p', 'muted', 'ไม่สามารถโหลดรายการสินค้าได้ กรุณาลองใหม่อีกครั้ง'));
      });
  }

  /* ==========================================================================
     2) order.html
     ========================================================================== */
  function initOrderPage() {
    const form = $('#orderForm');
    if (!form) return;

    /* เติมฟอร์มจาก URL parameter ทันทีที่โหลดหน้า */
    const params = new URLSearchParams(window.location.search);
    const item = params.get('item');
    const price = params.get('price');

    const itemsField = $('#items');
    const totalField = $('#total');

    if (itemsField && item) itemsField.value = item;
    if (totalField && price) totalField.value = price;   // ห้ามลืมช่อง total

    const valueOf = (id) => {
      const field = document.getElementById(id);
      return field ? field.value.trim() : '';
    };

    let sending = false;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (sending) return;
      if (!form.reportValidity()) return;

      const payload = {
        customerName: valueOf('customerName'),
        contact: valueOf('contact'),
        items: valueOf('items'),
        total: valueOf('total'),
        note: valueOf('note'),
      };

      const submitBtn = form.querySelector(
        'button[type="submit"], input[type="submit"], button:not([type])'
      );
      sending = true;
      if (submitBtn) submitBtn.disabled = true;

      fetch(ORDER_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        sending = false;
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ==========================================================================
     3) admin.html
     ========================================================================== */

  /* parse CSV เอง: รองรับ "..." , "" (quote ซ้อน), คอมมาและขึ้นบรรทัดใหม่ในช่อง, CRLF, BOM */
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += c;
      }
    }

    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  }

  function initAdminPage() {
    const tbody = $('#ordersTable tbody');
    if (!tbody) return;

    const COLUMNS = 6; // วันเวลา, ชื่อลูกค้า, เบอร์โทร/Line, รายการสินค้า, จำนวนเงินรวม, หมายเหตุ

    function showMessage(message) {
      tbody.textContent = '';
      const tr = el('tr');
      const td = el('td', 'muted', message);
      td.colSpan = COLUMNS;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    showMessage('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ (${res.status})`);
        return res.text();
      })
      .then((text) => {
        const rows = parseCSV(text);
        rows.shift(); // ตัดแถวหัวตาราง

        if (rows.length === 0) {
          showMessage('ยังไม่มีรายการสั่งซื้อ');
          return;
        }

        // Google Sheet เพิ่มแถวใหม่ต่อท้ายเสมอ → กลับลำดับให้ล่าสุดขึ้นก่อน
        rows.reverse();

        tbody.textContent = '';
        rows.forEach((cells) => {
          const tr = el('tr');
          for (let i = 0; i < COLUMNS; i++) {
            const value = cells[i] !== undefined ? cells[i] : '';
            tr.appendChild(el('td', null, i === 4 ? formatNumber(value) : value));
          }
          tbody.appendChild(tr);
        });
      })
      .catch((error) => {
        console.error(error);
        showMessage('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- เริ่มทำงาน ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
