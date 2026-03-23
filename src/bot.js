const { Telegraf, Markup } = require('telegraf');

const MENU = {
  catalog: '📦 Каталог',
  tradeIn: '🔁 Трейд-ин',
  sell: '💰 Продать устройство',
  myRequests: '📋 Мои заявки',
  info: 'ℹ️ Инфо',
  cancel: '❌ Отмена',
};

const MAIN_MENU = Markup.keyboard([
  [MENU.catalog, MENU.tradeIn],
  [MENU.sell, MENU.myRequests],
]).resize();

const CATALOG_STEPS = ['category', 'brand', 'model', 'memory', 'country'];

const STEP_LABELS = {
  category: 'категорию',
  brand: 'марку',
  model: 'модель',
  memory: 'память',
  country: 'страну',
};

const OFFER_STATUS_LABELS = {
  new: 'Новая',
  review: 'На проверке',
  accepted: 'Принята',
  rejected: 'Отклонена',
  done: 'Сделка завершена',
};

const ORDER_STATUS_LABELS = {
  new: 'Новый',
  processing: 'В работе',
  done: 'Закрыт',
  cancelled: 'Отменён',
};

const LEAD_TRIGGER_STEPS = [
  {
    delayMs: 5 * 60 * 1000,
    text: 'Менеджер уже подбирает для Вас лучшее предложение. Ответьте на это сообщение, если хотите ускорить связь.',
  },
  {
    delayMs: 60 * 60 * 1000,
    text: 'Есть выгодные варианты под Ваш запрос. Напишите удобное время, и менеджер свяжется с Вами в приоритете.',
  },
  {
    delayMs: 24 * 60 * 60 * 1000,
    text: 'Напоминаем по Вашей заявке: можем зафиксировать цену и условия сегодня. Если актуально, ответьте одним сообщением.',
  },
];

const ORDER_TRADE_IN_KEYBOARD = Markup.inlineKeyboard([
  [
    Markup.button.callback('✅ Да, в трейд-ин', 'order_ti:yes'),
    Markup.button.callback('❌ Нет', 'order_ti:no'),
  ],
]);

const CONTACT_REQUEST_KEYBOARD = Markup.keyboard([
  [Markup.button.contactRequest('📱 Отправить номер телефона')],
]).resize().oneTime();

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
  return `${amount.toLocaleString('ru-RU')}₽`;
}

function parsePrice(value) {
  const normalized = (value || '')
    .toString()
    .replace(/\s+/g, '')
    .replace(/₽/g, '')
    .replace(/,/g, '.');

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

function toFlag(code) {
  const normalized = (code || '').toString().trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return '🏳️';
  }

  return String.fromCodePoint(...normalized.split('').map((char) => char.charCodeAt(0) + 127397));
}

function buildRows(buttons, perRow = 2) {
  const rows = [];
  for (let index = 0; index < buttons.length; index += perRow) {
    rows.push(buttons.slice(index, index + perRow));
  }
  return rows;
}

function productTitle(product) {
  const base = [
    `${toFlag(product.country)}`,
    product.brand,
    product.model,
    product.memory,
    product.color,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${base} ${formatPrice(product.price)}`.trim();
}

function createBot({ token, store, leadsChatId, adminChatIds = [] }) {
  if (!token) {
    throw new Error('BOT_TOKEN is not set');
  }

  const bot = new Telegraf(token);
  const flowState = new Map();
  const catalogState = new Map();
  let triggerTimer = null;

  const leadsTargetChatId = Number(leadsChatId) || Number(adminChatIds[0] || 0) || 0;

  async function replyWithLog(ctx, text, extra = {}) {
    const response = await ctx.reply(text, extra);
    if (ctx.from && ctx.from.id) {
      store.addMessage({ tgId: ctx.from.id, direction: 'out', text });
    }
    return response;
  }

  async function sendDirectWithLog(tgId, text, extra = {}) {
    await bot.telegram.sendMessage(tgId, text, extra);
    store.addMessage({ tgId, direction: 'out', text });
  }

  async function notifyLeadChat(text) {
    if (!leadsTargetChatId) {
      return;
    }

    try {
      await bot.telegram.sendMessage(leadsTargetChatId, text, { parse_mode: 'HTML' });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to send lead to target chat:', error.message);
    }
  }

  function getUserFlow(tgId) {
    if (!flowState.has(tgId)) {
      return null;
    }
    return flowState.get(tgId);
  }

  function setUserFlow(tgId, value) {
    flowState.set(tgId, value);
  }

  function resetUserFlow(tgId) {
    flowState.delete(tgId);
  }

  function getCatalogSession(tgId) {
    if (!catalogState.has(tgId)) {
      catalogState.set(tgId, {
        selected: {},
        pending: null,
      });
    }

    return catalogState.get(tgId);
  }

  function resetCatalogSession(tgId) {
    catalogState.set(tgId, {
      selected: {},
      pending: null,
    });
  }

  function buildFiltersFromSelection(selected) {
    const filters = {};
    for (const field of CATALOG_STEPS) {
      if (selected[field]) {
        filters[field] = selected[field];
      }
    }
    return filters;
  }

  async function askCatalogStep(ctx, tgId, { edit = false } = {}) {
    const session = getCatalogSession(tgId);
    const selected = session.selected;
    const nextStepIndex = CATALOG_STEPS.findIndex((field) => !selected[field]);

    if (nextStepIndex < 0) {
      return showCatalogProducts(ctx, tgId, { edit });
    }

    const field = CATALOG_STEPS[nextStepIndex];
    const filters = buildFiltersFromSelection(selected);
    const options = store.listCatalogValues(field, filters);

    if (options.length === 0) {
      return showCatalogProducts(ctx, tgId, { edit });
    }

    session.pending = {
      stepIndex: nextStepIndex,
      field,
      options,
    };

    const optionButtons = options.map((value, index) =>
      Markup.button.callback(value, `cf:${nextStepIndex}:${index}`)
    );

    const navButtons = [];
    if (nextStepIndex > 0) {
      navButtons.push(Markup.button.callback('⬅️ Назад', 'cf_back'));
    }
    const keyboardRows = buildRows(optionButtons, 2);
    if (navButtons.length > 0) {
      keyboardRows.push(navButtons);
    }
    const keyboard = Markup.inlineKeyboard(keyboardRows);
    const text = `Выберите ${STEP_LABELS[field]}:`;

    if (edit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(text, keyboard);
        return;
      } catch (_error) {
        // ignore and fallback to reply
      }
    }

    await replyWithLog(ctx, text, keyboard);
  }

  async function showCatalogProducts(ctx, tgId, { edit = false } = {}) {
    const session = getCatalogSession(tgId);
    const filters = buildFiltersFromSelection(session.selected);
    const products = store.getProducts({ filters });

    if (products.length === 0) {
      const text = 'По выбранным параметрам пока нет позиций. Попробуйте изменить выбор.';
      if (edit && ctx.callbackQuery) {
        try {
          await ctx.editMessageText(text);
          return;
        } catch (_error) {
          // ignore
        }
      }

      await replyWithLog(ctx, text);
      return;
    }

    if (edit && ctx.callbackQuery) {
      try {
        await ctx.editMessageText(`Найдено позиций: ${products.length}`);
      } catch (_error) {
        // ignore
      }
    }

    const maxCards = 20;
    for (const product of products.slice(0, maxCards)) {
      const message = productTitle(product);
      const keyboard = Markup.inlineKeyboard([
        [
          Markup.button.callback('🛒 Оставить заявку', `buy:${product.id}`),
          Markup.button.callback('🔁 Обмен', `trade:${product.id}`),
        ],
      ]);

      await replyWithLog(ctx, message, keyboard);
    }

    if (products.length > maxCards) {
      await replyWithLog(ctx, `Показано ${maxCards} из ${products.length} позиций. Уточните фильтры для более точного списка.`);
    }
  }

  function startTradeInFlow(tgId, desiredProductId = '') {
    const desiredProduct = desiredProductId ? store.getProductById(desiredProductId) : null;

    const flow = {
      type: 'tradein',
      step: desiredProduct ? 'offeredItem' : 'desiredItem',
      data: {
        desiredProductId: desiredProduct ? desiredProduct.id : '',
        desiredItemText: desiredProduct ? productTitle(desiredProduct) : '',
      },
    };

    setUserFlow(tgId, flow);
    return flow;
  }

  function startSellFlow(tgId) {
    setUserFlow(tgId, {
      type: 'sell',
      step: 'item',
      data: {},
    });
  }

  function startOrderFlow(tgId, productId) {
    setUserFlow(tgId, {
      type: 'order',
      step: 'tradeInDecision',
      data: {
        productId,
        withTradeIn: null,
      },
    });
  }

  function renderLeadForChat(lead, user) {
    const title = lead.leadType === 'buy' ? '🛒 Новая заявка на покупку' : lead.leadType === 'sell' ? '💰 Новая заявка на выкуп' : '🔁 Новая заявка на трейд-ин';

    const lines = [
      `<b>${title}</b>`,
      `Lead ID: <code>${escapeHtml(lead.id)}</code>`,
      `Клиент: ${escapeHtml(user.firstName || '')} ${escapeHtml(user.lastName || '')}`.trim(),
      `Username: @${escapeHtml(user.username || '-')}`,
      `TG ID: <code>${escapeHtml(String(user.tgId || ''))}</code>`,
      `Создано: ${escapeHtml(lead.createdAt)}`,
      '',
      `Источник: ${escapeHtml(lead.sourceType)} / ${escapeHtml(lead.sourceId)}`,
      `Тип лида: ${escapeHtml(lead.leadType)}`,
      `Статус: ${escapeHtml(lead.status)}`,
    ];

    const metaLines = Object.entries(lead.meta || {}).map(([key, value]) => `${key}: ${value}`);
    if (metaLines.length) {
      lines.push('', '<b>Детали:</b>');
      lines.push(...metaLines.map((line) => escapeHtml(String(line))));
    }

    return lines.join('\n');
  }

  async function createLeadAndNotify({ tgId, sourceType, sourceId, leadType, meta }) {
    const lead = store.addLead({
      tgId,
      sourceType,
      sourceId,
      leadType,
      status: 'new',
      triggerStage: 0,
      meta,
    });

    if (!lead) {
      return;
    }

    const user = store.getUserByTgId(tgId) || { tgId };
    await notifyLeadChat(renderLeadForChat(lead, user));
  }

  async function showMainMenu(ctx, text = 'Выберите действие:') {
    await replyWithLog(ctx, text, MAIN_MENU);
  }

  async function showUserRequests(ctx) {
    const tgId = ctx.from.id;
    const data = store.getUserRequests(tgId);

    const lines = ['Ваши заявки:'];

    if (!data.orders.length && !data.offers.length) {
      lines.push('Пока заявок нет. Нажмите «Каталог» или «Трейд-ин».');
      await replyWithLog(ctx, lines.join('\n'), MAIN_MENU);
      return;
    }

    if (data.orders.length) {
      lines.push('', 'Покупка:');
      for (const order of data.orders.slice(0, 10)) {
        const product = store.getProductById(order.productId);
        const status = ORDER_STATUS_LABELS[order.status] || order.status;
        const line = `• ${product ? productTitle(product) : order.productId} | Статус: ${status}`;
        lines.push(line);
      }
    }

    if (data.offers.length) {
      lines.push('', 'Обмен/выкуп:');
      for (const offer of data.offers.slice(0, 10)) {
        const status = OFFER_STATUS_LABELS[offer.status] || offer.status;
        const type = offer.type === 'tradein' ? 'Трейд-ин' : 'Выкуп';
        lines.push(`• ${type} | Цена: ${formatPrice(offer.offeredPrice)} | Статус: ${status}`);
      }
    }

    await replyWithLog(ctx, lines.join('\n'), MAIN_MENU);
  }

  async function sendManagerWillContact(ctx) {
    await replyWithLog(ctx, 'С Вами сейчас свяжется менеджер', MAIN_MENU);
  }

  async function askForContact(ctx) {
    await replyWithLog(
      ctx,
      'Оставьте контакт для связи (телефон/Telegram).\nМожно нажать кнопку «📱 Отправить номер телефона» ниже.',
      CONTACT_REQUEST_KEYBOARD
    );
  }

  async function finalizeFlowWithContact(ctx, contactValue) {
    const tgId = ctx.from.id;
    const flow = getUserFlow(tgId);
    if (!flow || flow.step !== 'contact') {
      return false;
    }

    const normalizedContact = (contactValue || '').toString().trim();
    if (!normalizedContact) {
      await askForContact(ctx);
      return true;
    }

    flow.data.contact = normalizedContact;

    if (flow.type === 'tradein') {
      const offer = store.addOffer({
        tgId,
        type: 'tradein',
        desiredProductId: flow.data.desiredProductId || '',
        offeredPrice: flow.data.offeredPrice || 0,
        details: {
          desiredItem: flow.data.desiredItemText || '',
          offeredItem: flow.data.offeredItem || '',
          condition: flow.data.condition || '',
        },
        contact: flow.data.contact,
        status: 'new',
      });

      resetUserFlow(tgId);

      if (offer) {
        await createLeadAndNotify({
          tgId,
          sourceType: 'offer',
          sourceId: offer.id,
          leadType: 'tradein',
          meta: {
            desiredItem: flow.data.desiredItemText || '-',
            offeredItem: flow.data.offeredItem || '-',
            condition: flow.data.condition || '-',
            offeredPrice: formatPrice(flow.data.offeredPrice || 0),
            contact: flow.data.contact || '-',
          },
        });
      }

      await sendManagerWillContact(ctx);
      return true;
    }

    if (flow.type === 'sell') {
      const offer = store.addOffer({
        tgId,
        type: 'sell',
        offeredPrice: flow.data.offeredPrice || 0,
        details: {
          item: flow.data.item || '',
          condition: flow.data.condition || '',
        },
        contact: flow.data.contact,
        status: 'new',
      });

      resetUserFlow(tgId);

      if (offer) {
        await createLeadAndNotify({
          tgId,
          sourceType: 'offer',
          sourceId: offer.id,
          leadType: 'sell',
          meta: {
            item: flow.data.item || '-',
            condition: flow.data.condition || '-',
            offeredPrice: formatPrice(flow.data.offeredPrice || 0),
            contact: flow.data.contact || '-',
          },
        });
      }

      await sendManagerWillContact(ctx);
      return true;
    }

    if (flow.type === 'order') {
      const product = store.getProductById(flow.data.productId);
      const finalPrice = Number(product?.price || 0);
      const commentLines = [];
      if (flow.data.withTradeIn) {
        commentLines.push('Покупка в трейд-ин: Да');
        commentLines.push(`Устройство клиента: ${flow.data.tradeInDevice || '-'}`);
        commentLines.push(`Оценка устройства: ${formatPrice(flow.data.tradeInDevicePrice || 0)}`);
        commentLines.push(`Фото (file_id): ${flow.data.tradeInPhotoFileId || '-'}`);
      } else {
        commentLines.push('Покупка в трейд-ин: Нет');
      }

      const order = store.addOrder({
        tgId,
        productId: flow.data.productId,
        offeredPrice: finalPrice,
        comment: commentLines.join('\n'),
        contact: flow.data.contact,
        status: 'new',
      });

      resetUserFlow(tgId);

      if (order) {
        await createLeadAndNotify({
          tgId,
          sourceType: 'order',
          sourceId: order.id,
          leadType: 'buy',
          meta: {
            product: product ? productTitle(product) : flow.data.productId,
            catalogPrice: formatPrice(finalPrice),
            withTradeIn: flow.data.withTradeIn ? 'Да' : 'Нет',
            tradeInDevice: flow.data.withTradeIn ? flow.data.tradeInDevice || '-' : '-',
            tradeInDevicePrice: flow.data.withTradeIn ? formatPrice(flow.data.tradeInDevicePrice || 0) : '-',
            tradeInPhotoFileId: flow.data.withTradeIn ? flow.data.tradeInPhotoFileId || '-' : '-',
            contact: flow.data.contact || '-',
          },
        });
      }

      await sendManagerWillContact(ctx);
      return true;
    }

    return false;
  }

  async function handleFlowInput(ctx) {
    const tgId = ctx.from.id;
    const text = (ctx.message.text || '').trim();
    const flow = getUserFlow(tgId);

    if (!flow) {
      return false;
    }

    if (flow.type === 'tradein') {
      if (flow.step === 'desiredItem') {
        flow.data.desiredItemText = text;
        flow.step = 'offeredItem';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Что предлагаете на обмен? Укажите товар, модель и характеристики.');
        return true;
      }

      if (flow.step === 'offeredItem') {
        flow.data.offeredItem = text;
        flow.step = 'condition';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Опишите состояние Вашего товара (новый/б.у., дефекты, комплект).');
        return true;
      }

      if (flow.step === 'condition') {
        flow.data.condition = text;
        flow.step = 'offeredPrice';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Укажите Вашу цену предложения или доплату в рублях.');
        return true;
      }

      if (flow.step === 'offeredPrice') {
        const price = parsePrice(text);
        if (price === null) {
          await replyWithLog(ctx, 'Цена должна быть числом. Пример: 25000');
          return true;
        }

        flow.data.offeredPrice = price;
        flow.step = 'contact';
        setUserFlow(tgId, flow);
        await askForContact(ctx);
        return true;
      }

      if (flow.step === 'contact') {
        return finalizeFlowWithContact(ctx, text);
      }
    }

    if (flow.type === 'sell') {
      if (flow.step === 'item') {
        flow.data.item = text;
        flow.step = 'condition';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Опишите состояние устройства и комплектацию.');
        return true;
      }

      if (flow.step === 'condition') {
        flow.data.condition = text;
        flow.step = 'offeredPrice';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Укажите желаемую цену продажи в рублях.');
        return true;
      }

      if (flow.step === 'offeredPrice') {
        const price = parsePrice(text);
        if (price === null) {
          await replyWithLog(ctx, 'Цена должна быть числом. Пример: 35000');
          return true;
        }

        flow.data.offeredPrice = price;
        flow.step = 'contact';
        setUserFlow(tgId, flow);
        await askForContact(ctx);
        return true;
      }

      if (flow.step === 'contact') {
        return finalizeFlowWithContact(ctx, text);
      }
    }

    if (flow.type === 'order') {
      if (flow.step === 'tradeInDecision') {
        await replyWithLog(ctx, 'Выберите вариант кнопками ниже: покупка в трейд-ин?', ORDER_TRADE_IN_KEYBOARD);
        return true;
      }

      if (flow.step === 'tradeInDevice') {
        flow.data.tradeInDevice = text;
        flow.step = 'tradeInDevicePrice';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Укажите вашу оценку устройства в рублях.');
        return true;
      }

      if (flow.step === 'tradeInDevicePrice') {
        const price = parsePrice(text);
        if (price === null) {
          await replyWithLog(ctx, 'Цена устройства должна быть числом. Пример: 35000');
          return true;
        }

        flow.data.tradeInDevicePrice = price;
        flow.step = 'tradeInPhoto';
        setUserFlow(tgId, flow);
        await replyWithLog(ctx, 'Пришлите фото вашего устройства.');
        return true;
      }

      if (flow.step === 'contact') {
        return finalizeFlowWithContact(ctx, text);
      }
    }

    return false;
  }

  async function handlePhotoInput(ctx) {
    const tgId = ctx.from?.id;
    if (!tgId) {
      return false;
    }

    const flow = getUserFlow(tgId);
    if (!flow || flow.type !== 'order' || flow.step !== 'tradeInPhoto') {
      return false;
    }

    const photos = ctx.message?.photo;
    if (!Array.isArray(photos) || photos.length === 0) {
      await replyWithLog(ctx, 'Для заявки в трейд-ин нужно фото устройства. Пришлите фото.');
      return true;
    }

    const bestPhoto = photos[photos.length - 1];
    flow.data.tradeInPhotoFileId = bestPhoto.file_id || '';
    flow.step = 'contact';
    setUserFlow(tgId, flow);

    await askForContact(ctx);
    return true;
  }

  async function handleContactInput(ctx) {
    const tgId = ctx.from?.id;
    if (!tgId) {
      return false;
    }

    const flow = getUserFlow(tgId);
    const contact = ctx.message?.contact;
    if (!flow || flow.step !== 'contact' || !contact) {
      return false;
    }

    const rawPhone = (contact.phone_number || '').toString().trim();
    const phone = rawPhone ? (rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`) : '';
    const fallbackName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    const contactText = phone || fallbackName;

    return finalizeFlowWithContact(ctx, contactText);
  }

  async function runLeadTriggers() {
    const leads = store
      .getLeads()
      .filter((lead) => ['new', 'in_progress'].includes(lead.status) && lead.triggerStage < LEAD_TRIGGER_STEPS.length);

    const nowMs = Date.now();

    for (const lead of leads) {
      const trigger = LEAD_TRIGGER_STEPS[lead.triggerStage];
      if (!trigger) {
        continue;
      }

      const createdAtMs = new Date(lead.createdAt).getTime();
      if (!Number.isFinite(createdAtMs)) {
        continue;
      }

      if (nowMs - createdAtMs < trigger.delayMs) {
        continue;
      }

      try {
        await sendDirectWithLog(lead.tgId, trigger.text, MAIN_MENU);
        store.updateLead(lead.id, {
          triggerStage: lead.triggerStage + 1,
          lastTriggerAt: new Date().toISOString(),
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to send lead trigger:', error.message);
      }
    }
  }

  function startLeadTriggerScheduler() {
    if (triggerTimer) {
      clearInterval(triggerTimer);
    }

    triggerTimer = setInterval(() => {
      runLeadTriggers().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Lead trigger scheduler error:', error.message);
      });
    }, 60 * 1000);
  }

  function stopLeadTriggerScheduler() {
    if (triggerTimer) {
      clearInterval(triggerTimer);
      triggerTimer = null;
    }
  }

  bot.use(async (ctx, next) => {
    if (ctx.from) {
      store.upsertUser(ctx.from);
    }

    if (ctx.message && typeof ctx.message.text === 'string' && ctx.from) {
      store.addMessage({
        tgId: ctx.from.id,
        direction: 'in',
        text: ctx.message.text,
      });
    }

    await next();
  });

  bot.start(async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showMainMenu(ctx, 'Добро пожаловать. Выберите действие:');
  });

  bot.command('home', async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showMainMenu(ctx);
  });

  bot.command('catalog', async (ctx) => {
    resetUserFlow(ctx.from.id);
    resetCatalogSession(ctx.from.id);
    await askCatalogStep(ctx, ctx.from.id);
  });

  bot.command('myorders', async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showUserRequests(ctx);
  });

  bot.command('cancel', async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showMainMenu(ctx, 'Действие отменено.');
  });

  bot.hears(MENU.catalog, async (ctx) => {
    resetUserFlow(ctx.from.id);
    resetCatalogSession(ctx.from.id);
    await askCatalogStep(ctx, ctx.from.id);
  });

  bot.hears(MENU.tradeIn, async (ctx) => {
    const flow = startTradeInFlow(ctx.from.id);
    if (flow.step === 'desiredItem') {
      await replyWithLog(ctx, 'Что хотите получить из каталога? Укажите марку/модель/память/страну.');
      return;
    }

    await replyWithLog(ctx, 'Что предлагаете на обмен? Укажите товар, модель и характеристики.');
  });

  bot.hears(MENU.sell, async (ctx) => {
    startSellFlow(ctx.from.id);
    await replyWithLog(ctx, 'Что хотите продать? Укажите марку/модель/память/страну.');
  });

  bot.hears(MENU.myRequests, async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showUserRequests(ctx);
  });

  bot.hears(MENU.info, async (ctx) => {
    await replyWithLog(
      ctx,
      [
        'Работаем с телефонами и другими категориями товаров: техника, транспорт, участки, недвижимость и другое.',
        'Вы можете:',
        '• выбрать товар в каталоге',
        '• предложить обмен (трейд-ин)',
        '• предложить продажу своего устройства',
        'После отправки заявки менеджер свяжется с Вами.',
      ].join('\n'),
      MAIN_MENU
    );
  });

  bot.hears(MENU.cancel, async (ctx) => {
    resetUserFlow(ctx.from.id);
    await showMainMenu(ctx, 'Действие отменено.');
  });

  bot.action(/^cf:(\d+):(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from.id;
    const stepIndex = Number(ctx.match[1]);
    const optionIndex = Number(ctx.match[2]);

    const session = getCatalogSession(tgId);
    const pending = session.pending;

    if (!pending || pending.stepIndex !== stepIndex) {
      await askCatalogStep(ctx, tgId, { edit: true });
      return;
    }

    const selectedValue = pending.options[optionIndex];
    const field = CATALOG_STEPS[stepIndex];

    if (!selectedValue || !field) {
      await askCatalogStep(ctx, tgId, { edit: true });
      return;
    }

    session.selected[field] = selectedValue;
    session.pending = null;

    await askCatalogStep(ctx, tgId, { edit: true });
  });

  bot.action('cf_back', async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from.id;
    const session = getCatalogSession(tgId);

    for (let index = CATALOG_STEPS.length - 1; index >= 0; index -= 1) {
      const field = CATALOG_STEPS[index];
      if (session.selected[field]) {
        delete session.selected[field];
        break;
      }
    }

    session.pending = null;
    await askCatalogStep(ctx, tgId, { edit: true });
  });

  bot.action(/^buy:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from.id;
    const productId = ctx.match[1];
    const product = store.getProductById(productId);

    if (!product) {
      await replyWithLog(ctx, 'Позиция не найдена. Обновите каталог и попробуйте снова.');
      return;
    }

    startOrderFlow(tgId, productId);
    await replyWithLog(
      ctx,
      `Вы выбрали: ${productTitle(product)}\nСтоимость: ${formatPrice(product.price)}\nПокупка в трейд-ин?`,
      ORDER_TRADE_IN_KEYBOARD
    );
  });

  bot.action(/^order_ti:(yes|no)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from.id;
    const flow = getUserFlow(tgId);

    if (!flow || flow.type !== 'order') {
      await replyWithLog(ctx, 'Заявка покупки не найдена. Выберите товар в каталоге заново.');
      return;
    }

    const choice = ctx.match[1];

    if (choice === 'yes') {
      flow.data.withTradeIn = true;
      flow.step = 'tradeInDevice';
      setUserFlow(tgId, flow);
      await replyWithLog(
        ctx,
        'Опишите ваше устройство для трейд-ин: марка, модель, память, состояние и комплектация.'
      );
      return;
    }

    flow.data.withTradeIn = false;
    flow.step = 'contact';
    setUserFlow(tgId, flow);
    await askForContact(ctx);
  });

  bot.action(/^trade:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const tgId = ctx.from.id;
    const productId = ctx.match[1];
    const flow = startTradeInFlow(tgId, productId);

    if (flow.data.desiredItemText) {
      await replyWithLog(
        ctx,
        `Товар для обмена выбран: ${flow.data.desiredItemText}\nТеперь укажите, что предлагаете взамен.`
      );
      return;
    }

    await replyWithLog(ctx, 'Что хотите получить из каталога? Укажите марку/модель/память/страну.');
  });

  bot.on('text', async (ctx) => {
    const text = (ctx.message.text || '').trim();
    const knownMenu = new Set(Object.values(MENU));

    if (!text) {
      return;
    }

    if (text.startsWith('/')) {
      return;
    }

    if (knownMenu.has(text)) {
      return;
    }

    const consumed = await handleFlowInput(ctx);
    if (consumed) {
      return;
    }

    await replyWithLog(ctx, 'Выберите действие в меню ниже.', MAIN_MENU);
  });

  bot.on('message', async (ctx, next) => {
    if (ctx.message && !('text' in ctx.message)) {
      const mediaConsumed = await handlePhotoInput(ctx);
      if (mediaConsumed) {
        return;
      }

      const contactConsumed = await handleContactInput(ctx);
      if (contactConsumed) {
        return;
      }

      const flow = getUserFlow(ctx.from?.id);
      if (flow) {
        if (flow.type === 'order' && flow.step === 'tradeInPhoto') {
          await replyWithLog(ctx, 'Нужно именно фото устройства. Пришлите фото.');
          return;
        }

        await replyWithLog(ctx, 'Пожалуйста, отправьте ответ текстом, чтобы оформить заявку.');
        return;
      }
    }

    await next();
  });

  return {
    bot,
    async launch() {
      await bot.launch();
      startLeadTriggerScheduler();
      await runLeadTriggers();
    },
    stop(signal = 'SIGTERM') {
      stopLeadTriggerScheduler();
      bot.stop(signal);
    },
    menu: MAIN_MENU,
  };
}

module.exports = { createBot, MENU, ORDER_STATUS_LABELS, OFFER_STATUS_LABELS };
