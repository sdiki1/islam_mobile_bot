const express = require('express');
const session = require('express-session');

const ORDER_STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'processing', label: 'В работе' },
  { value: 'done', label: 'Закрыт' },
  { value: 'cancelled', label: 'Отменён' },
];

const OFFER_STATUS_OPTIONS = [
  { value: 'new', label: 'Новая' },
  { value: 'review', label: 'На проверке' },
  { value: 'accepted', label: 'Принята' },
  { value: 'rejected', label: 'Отклонена' },
  { value: 'done', label: 'Сделка завершена' },
];

const LEAD_STATUS_OPTIONS = [
  { value: 'new', label: 'Новый' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'won', label: 'Успешно' },
  { value: 'lost', label: 'Потерян' },
  { value: 'closed', label: 'Закрыт' },
];

function escapeHtml(value) {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(value) {
  const amount = Number(value || 0);
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

function formatDateTime(value) {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('ru-RU');
}

function statusSelect(name, current, options) {
  const items = options
    .map((option) => {
      const selected = option.value === current ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join('');

  return `<select name="${escapeHtml(name)}">${items}</select>`;
}

function input(name, value, placeholder = '') {
  return `<input name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" />`;
}

function textarea(name, value, placeholder = '') {
  return `<textarea name="${escapeHtml(name)}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>`;
}

function pageTemplate({ title, active = '', content, notice = '' }) {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --line: #dbe2ea;
      --accent: #1f6feb;
      --accent-soft: #e8f0ff;
      --ok: #0f9d58;
      --warn: #d97706;
      --danger: #dc2626;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: linear-gradient(180deg, #f5f7fb 0%, #eef3ff 100%);
      color: var(--text);
      font-family: "SF Pro Display", "Segoe UI", Tahoma, sans-serif;
    }

    .layout {
      max-width: 1300px;
      margin: 0 auto;
      padding: 20px;
      display: grid;
      gap: 16px;
    }

    .topbar {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .brand {
      font-weight: 700;
      letter-spacing: 0.2px;
    }

    .nav {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .nav a {
      text-decoration: none;
      color: var(--muted);
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 14px;
    }

    .nav a.active {
      color: #0b3d91;
      background: var(--accent-soft);
      border-color: #bdd1ff;
      font-weight: 600;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
    }

    .grid {
      display: grid;
      gap: 14px;
    }

    .grid.two {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    h1, h2, h3 {
      margin: 0 0 12px;
    }

    p {
      margin: 0;
      color: var(--muted);
    }

    form {
      display: grid;
      gap: 8px;
    }

    input, select, textarea, button {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font: inherit;
      background: #fff;
      color: var(--text);
    }

    textarea {
      min-height: 90px;
      resize: vertical;
    }

    button {
      cursor: pointer;
      background: #f8fbff;
    }

    .btn-primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
      font-weight: 600;
    }

    .btn-danger {
      background: #fee2e2;
      border-color: #fecaca;
      color: #991b1b;
    }

    .table-wrap { overflow-x: auto; }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 900px;
    }

    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 8px;
      text-align: left;
      vertical-align: top;
      font-size: 14px;
    }

    th {
      color: var(--muted);
      font-weight: 600;
      background: #f8fafc;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .chip {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 13px;
    }

    .notice {
      border-radius: 10px;
      padding: 10px 12px;
      background: #ecfdf3;
      border: 1px solid #b9f0d1;
      color: #17663c;
    }

    .split {
      display: grid;
      gap: 16px;
      grid-template-columns: minmax(260px, 360px) 1fr;
    }

    .chat-list {
      max-height: 70vh;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px;
      background: #fcfdff;
    }

    .chat-link {
      display: block;
      text-decoration: none;
      color: var(--text);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px;
      margin-bottom: 8px;
      background: #fff;
    }

    .chat-link.active {
      border-color: #93c5fd;
      background: #eff6ff;
    }

    .messages {
      max-height: 58vh;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      background: #fcfdff;
      display: grid;
      gap: 10px;
    }

    .bubble {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px;
      font-size: 14px;
      background: #fff;
    }

    .bubble.out {
      border-color: #bfdbfe;
      background: #eff6ff;
    }

    .muted {
      color: var(--muted);
      font-size: 12px;
    }

    @media (max-width: 1000px) {
      .split {
        grid-template-columns: 1fr;
      }

      table {
        min-width: 760px;
      }
    }
  </style>
</head>
<body>
  <div class="layout">
    <div class="topbar">
      <div class="brand">Admin Panel</div>
      <div class="nav">
        <a href="/" class="${active === 'dashboard' ? 'active' : ''}">Дашборд</a>
        <a href="/products" class="${active === 'products' ? 'active' : ''}">Товары</a>
        <a href="/orders" class="${active === 'orders' ? 'active' : ''}">Покупки</a>
        <a href="/offers" class="${active === 'offers' ? 'active' : ''}">Трейд-ин/Выкуп</a>
        <a href="/leads" class="${active === 'leads' ? 'active' : ''}">Лиды</a>
        <a href="/chats" class="${active === 'chats' ? 'active' : ''}">Чаты</a>
        <a href="/logout">Выход</a>
      </div>
    </div>
    ${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}
    ${content}
  </div>
</body>
</html>`;
}

function mapOrderStatusToLeadStatus(status) {
  const map = {
    new: 'new',
    processing: 'in_progress',
    done: 'won',
    cancelled: 'lost',
  };
  return map[status] || 'in_progress';
}

function mapOfferStatusToLeadStatus(status) {
  const map = {
    new: 'new',
    review: 'in_progress',
    accepted: 'in_progress',
    done: 'won',
    rejected: 'lost',
  };
  return map[status] || 'in_progress';
}

function getNotice(req) {
  return req.query.ok ? String(req.query.ok) : '';
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function createAdminApp({ store, adminPassword, sessionSecret, botApi }) {
  const app = express();

  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      name: 'admin.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12,
      },
    })
  );

  function isAuthed(req) {
    return Boolean(req.session && req.session.authenticated);
  }

  function requireAuth(req, res, next) {
    if (!isAuthed(req)) {
      res.redirect('/login');
      return;
    }
    next();
  }

  app.get('/login', (req, res) => {
    if (isAuthed(req)) {
      res.redirect('/');
      return;
    }

    const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Вход в админку</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(180deg, #eef4ff, #f8fafc); font-family: "SF Pro Display", "Segoe UI", sans-serif; }
    .card { width: min(420px, 92vw); background: #fff; border: 1px solid #dbe2ea; border-radius: 14px; padding: 20px; display: grid; gap: 10px; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    input, button { border-radius: 10px; border: 1px solid #dbe2ea; padding: 10px 12px; font: inherit; }
    button { background: #1f6feb; color: #fff; border-color: #1f6feb; font-weight: 600; cursor: pointer; }
    .err { color: #b91c1c; font-size: 14px; }
  </style>
</head>
<body>
  <form class="card" method="post" action="/login">
    <h1>Вход в админ-панель</h1>
    <input name="password" type="password" placeholder="Пароль" required />
    ${req.query.error ? '<div class="err">Неверный пароль</div>' : ''}
    <button type="submit">Войти</button>
  </form>
</body>
</html>`;

    res.status(200).send(html);
  });

  app.post('/login', (req, res) => {
    const password = (req.body.password || '').toString();
    if (password !== adminPassword) {
      res.redirect('/login?error=1');
      return;
    }

    req.session.authenticated = true;
    res.redirect('/');
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => {
      res.redirect('/login');
    });
  });

  app.get('/', requireAuth, (req, res) => {
    const stats = store.getStats();
    const content = `
      <div class="card">
        <h1>Дашборд</h1>
        <p>Система управления ботом и лидами.</p>
      </div>
      <div class="grid two">
        <div class="card"><h3>Товары</h3><div class="chips"><span class="chip">Всего: ${stats.products}</span></div></div>
        <div class="card"><h3>Клиенты</h3><div class="chips"><span class="chip">Всего: ${stats.users}</span></div></div>
        <div class="card"><h3>Покупки</h3><div class="chips"><span class="chip">Всего: ${stats.orders}</span><span class="chip">Новых: ${stats.newOrders}</span></div></div>
        <div class="card"><h3>Трейд-ин/Выкуп</h3><div class="chips"><span class="chip">Всего: ${stats.offers}</span><span class="chip">Новых: ${stats.newOffers}</span></div></div>
        <div class="card"><h3>Лиды</h3><div class="chips"><span class="chip">Всего: ${stats.leads}</span><span class="chip">Новых: ${stats.newLeads}</span></div></div>
        <div class="card"><h3>Сообщения</h3><div class="chips"><span class="chip">Всего: ${stats.messages}</span></div></div>
      </div>
    `;

    res.send(pageTemplate({
      title: 'Дашборд',
      active: 'dashboard',
      content,
      notice: getNotice(req),
    }));
  });

  app.get('/products', requireAuth, (req, res) => {
    const products = store.getProducts({ includeOutOfStock: true });

    const rows = products
      .map(
        (product) => `
          <tr>
            <td>${escapeHtml(product.id)}</td>
            <td>
              <form method="post" action="/products/${encodeURIComponent(product.id)}/update">
                ${input('category', product.category)}
            </td>
            <td>${input('brand', product.brand)}</td>
            <td>${input('model', product.model)}</td>
            <td>${input('memory', product.memory)}</td>
            <td>${input('country', product.country)}</td>
            <td>${input('color', product.color)}</td>
            <td>${input('price', product.price)}</td>
            <td>${input('currency', product.currency || 'RUB')}</td>
            <td>
              <label><input type="checkbox" name="inStock" ${product.inStock !== false ? 'checked' : ''} /> В наличии</label>
            </td>
            <td>
                <button type="submit" class="btn-primary">Сохранить</button>
              </form>
              <form method="post" action="/products/${encodeURIComponent(product.id)}/delete" onsubmit="return confirm('Удалить товар?');">
                <button type="submit" class="btn-danger">Удалить</button>
              </form>
            </td>
          </tr>
        `
      )
      .join('');

    const content = `
      <div class="grid two">
        <div class="card">
          <h2>Добавить товар</h2>
          <form method="post" action="/products">
            ${input('category', '', 'Категория (например, Телефоны)')}
            ${input('brand', '', 'Бренд')}
            ${input('model', '', 'Модель')}
            ${input('memory', '', 'Память')}
            ${input('country', '', 'Страна (RU/AE/HK...)')}
            ${input('color', '', 'Цвет')}
            ${input('price', '', 'Цена')}
            ${input('currency', 'RUB', 'Валюта')}
            <label><input type="checkbox" name="inStock" checked /> В наличии</label>
            <button type="submit" class="btn-primary">Добавить</button>
          </form>
        </div>
        <div class="card">
          <h2>Подсказка</h2>
          <p>Поля category/brand/model/memory/country используются ботом для фильтрации каталога.</p>
        </div>
      </div>

      <div class="card table-wrap">
        <h2>Товары в каталоге</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Категория</th><th>Бренд</th><th>Модель</th><th>Память</th><th>Страна</th><th>Цвет</th><th>Цена</th><th>Валюта</th><th>Наличие</th><th>Действия</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="11">Пока нет товаров</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(pageTemplate({
      title: 'Товары',
      active: 'products',
      content,
      notice: getNotice(req),
    }));
  });

  app.post('/products', requireAuth, (req, res) => {
    store.addProduct({
      category: req.body.category,
      brand: req.body.brand,
      model: req.body.model,
      memory: req.body.memory,
      country: req.body.country,
      color: req.body.color,
      price: req.body.price,
      currency: req.body.currency || 'RUB',
      inStock: req.body.inStock === 'on',
    });

    res.redirect('/products?ok=Товар+добавлен');
  });

  app.post('/products/:id/update', requireAuth, (req, res) => {
    store.updateProduct(req.params.id, {
      category: req.body.category,
      brand: req.body.brand,
      model: req.body.model,
      memory: req.body.memory,
      country: req.body.country,
      color: req.body.color,
      price: req.body.price,
      currency: req.body.currency || 'RUB',
      inStock: req.body.inStock === 'on',
    });

    res.redirect('/products?ok=Товар+обновлён');
  });

  app.post('/products/:id/delete', requireAuth, (req, res) => {
    store.deleteProduct(req.params.id);
    res.redirect('/products?ok=Товар+удалён');
  });

  app.get('/orders', requireAuth, (req, res) => {
    const orders = store.getOrders();

    const rows = orders
      .map((order) => {
        const user = store.getUserByTgId(order.tgId);
        const product = store.getProductById(order.productId);

        return `
          <tr>
            <td>${escapeHtml(order.id)}</td>
            <td><a href="/chats?tgId=${encodeURIComponent(String(order.tgId))}">${escapeHtml(String(order.tgId))}</a></td>
            <td>${escapeHtml(user?.username ? `@${user.username}` : user?.firstName || '-')}</td>
            <td>${escapeHtml(product ? `${product.brand} ${product.model} ${product.memory}` : order.productId)}</td>
            <td>${formatPrice(order.offeredPrice)}</td>
            <td>${escapeHtml(order.contact || '-')}</td>
            <td>${formatDateTime(order.createdAt)}</td>
            <td>
              <form method="post" action="/orders/${encodeURIComponent(order.id)}/status">
                ${statusSelect('status', order.status, ORDER_STATUS_OPTIONS)}
                <button type="submit">Сохранить</button>
              </form>
            </td>
          </tr>
        `;
      })
      .join('');

    const content = `
      <div class="card table-wrap">
        <h2>Заявки на покупку</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Клиент TG ID</th><th>Клиент</th><th>Товар</th><th>Цена</th><th>Контакт</th><th>Создано</th><th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="8">Пока нет заявок</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(pageTemplate({ title: 'Покупки', active: 'orders', content, notice: getNotice(req) }));
  });

  app.post('/orders/:id/status', requireAuth, (req, res) => {
    const order = store.updateOrderStatus(req.params.id, req.body.status || 'new');

    if (order) {
      const lead = store.getLeadBySource('order', order.id);
      if (lead) {
        store.updateLead(lead.id, { status: mapOrderStatusToLeadStatus(order.status) });
      }
    }

    res.redirect('/orders?ok=Статус+обновлён');
  });

  app.get('/offers', requireAuth, (req, res) => {
    const offers = store.getOffers();

    const rows = offers
      .map((offer) => {
        const user = store.getUserByTgId(offer.tgId);

        return `
          <tr>
            <td>${escapeHtml(offer.id)}</td>
            <td>${escapeHtml(offer.type === 'tradein' ? 'Трейд-ин' : 'Выкуп')}</td>
            <td><a href="/chats?tgId=${encodeURIComponent(String(offer.tgId))}">${escapeHtml(String(offer.tgId))}</a></td>
            <td>${escapeHtml(user?.username ? `@${user.username}` : user?.firstName || '-')}</td>
            <td>${formatPrice(offer.offeredPrice)}</td>
            <td>${escapeHtml(JSON.stringify(offer.details || {}))}</td>
            <td>${escapeHtml(offer.contact || '-')}</td>
            <td>${formatDateTime(offer.createdAt)}</td>
            <td>
              <form method="post" action="/offers/${encodeURIComponent(offer.id)}/status">
                ${statusSelect('status', offer.status, OFFER_STATUS_OPTIONS)}
                <button type="submit">Сохранить</button>
              </form>
            </td>
          </tr>
        `;
      })
      .join('');

    const content = `
      <div class="card table-wrap">
        <h2>Трейд-ин и выкуп</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Тип</th><th>Клиент TG ID</th><th>Клиент</th><th>Цена</th><th>Детали</th><th>Контакт</th><th>Создано</th><th>Статус</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9">Пока нет заявок</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(pageTemplate({ title: 'Трейд-ин/Выкуп', active: 'offers', content, notice: getNotice(req) }));
  });

  app.post('/offers/:id/status', requireAuth, (req, res) => {
    const offer = store.updateOfferStatus(req.params.id, req.body.status || 'new');

    if (offer) {
      const lead = store.getLeadBySource('offer', offer.id);
      if (lead) {
        store.updateLead(lead.id, { status: mapOfferStatusToLeadStatus(offer.status) });
      }
    }

    res.redirect('/offers?ok=Статус+обновлён');
  });

  app.get('/leads', requireAuth, (req, res) => {
    const statusFilter = req.query.status ? String(req.query.status) : '';
    const leads = store.getLeads(statusFilter ? { status: statusFilter } : {});

    const filterButtons = ['new', 'in_progress', 'won', 'lost', 'closed']
      .map((status) => {
        const active = statusFilter === status ? 'active' : '';
        return `<a class="${active}" href="/leads?status=${encodeURIComponent(status)}">${escapeHtml(status)}</a>`;
      })
      .join(' ');

    const rows = leads
      .map((lead) => {
        const user = store.getUserByTgId(lead.tgId);
        const metaText = Object.entries(lead.meta || {})
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n');

        return `
          <tr>
            <td>${escapeHtml(lead.id)}</td>
            <td><a href="/chats?tgId=${encodeURIComponent(String(lead.tgId))}">${escapeHtml(String(lead.tgId))}</a></td>
            <td>${escapeHtml(user?.username ? `@${user.username}` : user?.firstName || '-')}</td>
            <td>${escapeHtml(lead.leadType)}</td>
            <td>${escapeHtml(`${lead.sourceType}/${lead.sourceId}`)}</td>
            <td>${escapeHtml(metaText || '-')}</td>
            <td>${escapeHtml(String(lead.triggerStage))}</td>
            <td>${formatDateTime(lead.lastTriggerAt)}</td>
            <td>${formatDateTime(lead.createdAt)}</td>
            <td>
              <form method="post" action="/leads/${encodeURIComponent(lead.id)}/status">
                ${statusSelect('status', lead.status, LEAD_STATUS_OPTIONS)}
                ${input('managerComment', lead.managerComment || '', 'Комментарий менеджера')}
                <button type="submit">Сохранить</button>
              </form>
            </td>
          </tr>
        `;
      })
      .join('');

    const content = `
      <div class="card">
        <h2>Лиды</h2>
        <div class="nav">${filterButtons} <a href="/leads">Сбросить</a></div>
      </div>
      <div class="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Клиент TG ID</th><th>Клиент</th><th>Тип</th><th>Источник</th><th>Детали</th><th>Триггер стадия</th><th>Последний триггер</th><th>Создано</th><th>Управление</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="10">Пока нет лидов</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    res.send(pageTemplate({ title: 'Лиды', active: 'leads', content, notice: getNotice(req) }));
  });

  app.post('/leads/:id/status', requireAuth, (req, res) => {
    store.updateLead(req.params.id, {
      status: req.body.status || 'in_progress',
      managerComment: req.body.managerComment || '',
    });

    res.redirect('/leads?ok=Лид+обновлён');
  });

  app.get('/chats', requireAuth, (req, res) => {
    const users = store.getUsers();
    const selectedTgId = req.query.tgId ? Number(req.query.tgId) : Number(users[0]?.tgId || 0);

    const selectedUser = selectedTgId ? store.getUserByTgId(selectedTgId) : null;
    const messages = selectedUser ? store.getMessagesByTgId(selectedTgId, 400) : [];

    const chats = users
      .map((user) => {
        const label = user.username ? `@${user.username}` : `${user.firstName || ''} ${user.lastName || ''}`.trim() || String(user.tgId);
        const activeClass = Number(user.tgId) === Number(selectedTgId) ? 'active' : '';

        return `<a class="chat-link ${activeClass}" href="/chats?tgId=${encodeURIComponent(String(user.tgId))}">
          <strong>${escapeHtml(label)}</strong><br />
          <span class="muted">TG ID: ${escapeHtml(String(user.tgId))}</span>
        </a>`;
      })
      .join('');

    const messagesHtml = messages
      .map((message) => {
        const cls = message.direction === 'out' ? 'bubble out' : 'bubble';
        const dir = message.direction === 'out' ? 'Бот' : 'Клиент';

        return `<div class="${cls}">
          <div><strong>${escapeHtml(dir)}</strong></div>
          <div>${escapeHtml(message.text || '')}</div>
          <div class="muted">${formatDateTime(message.createdAt)}</div>
        </div>`;
      })
      .join('');

    const content = `
      <div class="grid two">
        <div class="card">
          <h2>Добавить клиента вручную</h2>
          <form method="post" action="/clients">
            ${input('tgId', '', 'Telegram ID')}
            ${input('username', '', 'username без @')}
            ${input('firstName', '', 'Имя')}
            ${input('lastName', '', 'Фамилия')}
            ${input('phone', '', 'Телефон')}
            ${textarea('note', '', 'Комментарий')}
            <button class="btn-primary" type="submit">Добавить/обновить</button>
          </form>
        </div>
        <div class="card">
          <h2>Инструкция</h2>
          <p>На этой странице можно просматривать историю переписки, отвечать клиентам и фиксировать заметки менеджера.</p>
        </div>
      </div>

      <div class="card split">
        <div>
          <h3>Клиенты</h3>
          <div class="chat-list">${chats || 'Пока нет клиентов'}</div>
        </div>
        <div>
          <h3>Диалог ${selectedUser ? escapeHtml(String(selectedUser.tgId)) : ''}</h3>
          ${selectedUser ? `
            <div class="grid two" style="margin-bottom: 10px;">
              <form method="post" action="/clients/${encodeURIComponent(String(selectedUser.tgId))}/note">
                ${textarea('note', selectedUser.note || '', 'Заметка по клиенту')}
                <button type="submit">Сохранить заметку</button>
              </form>
              <form method="post" action="/chats/${encodeURIComponent(String(selectedUser.tgId))}/send">
                ${textarea('text', '', 'Сообщение клиенту')}
                <button type="submit" class="btn-primary">Отправить сообщение</button>
              </form>
            </div>
          ` : '<p>Выберите клиента слева.</p>'}
          <div class="messages">${messagesHtml || '<p>Сообщений пока нет</p>'}</div>
        </div>
      </div>
    `;

    res.send(pageTemplate({ title: 'Чаты', active: 'chats', content, notice: getNotice(req) }));
  });

  app.post('/clients', requireAuth, (req, res) => {
    store.addManualClient({
      tgId: req.body.tgId,
      username: req.body.username,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      phone: req.body.phone,
      note: req.body.note,
    });

    res.redirect('/chats?ok=Клиент+добавлен');
  });

  app.post('/clients/:tgId/note', requireAuth, (req, res) => {
    store.updateUser(req.params.tgId, {
      note: req.body.note || '',
    });

    res.redirect(`/chats?tgId=${encodeURIComponent(req.params.tgId)}&ok=Заметка+обновлена`);
  });

  app.post(
    '/chats/:tgId/send',
    requireAuth,
    asyncHandler(async (req, res) => {
      const tgId = Number(req.params.tgId);
      const text = (req.body.text || '').toString().trim();

      if (!Number.isFinite(tgId) || !text) {
        res.redirect(`/chats?tgId=${encodeURIComponent(req.params.tgId)}&ok=Неверные+данные`);
        return;
      }

      await botApi.sendMessage(tgId, text);
      store.addMessage({ tgId, direction: 'out', text });

      res.redirect(`/chats?tgId=${encodeURIComponent(req.params.tgId)}&ok=Сообщение+отправлено`);
    })
  );

  app.use((error, req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error(error);
    res.status(500).send(pageTemplate({
      title: 'Ошибка',
      content: `<div class="card"><h2>Ошибка</h2><p>${escapeHtml(error.message || 'Internal error')}</p></div>`,
    }));
  });

  return app;
}

module.exports = { createAdminApp };
