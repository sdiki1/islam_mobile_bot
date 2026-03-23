const fs = require('fs');
const path = require('path');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.ensureDataFile();
    this.db = this.load();
  }

  ensureDataFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (!fs.existsSync(this.filePath)) {
      const initial = {
        products: [],
        users: [],
        messages: [],
        offers: [],
        orders: [],
        leads: [],
      };
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2), 'utf8');
    }
  }

  load() {
    const raw = fs.readFileSync(this.filePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');

    return {
      products: Array.isArray(parsed.products) ? parsed.products : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      offers: Array.isArray(parsed.offers) ? parsed.offers : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : [],
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
    };
  }

  save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.db, null, 2), 'utf8');
  }

  getProducts({ includeOutOfStock = false, filters = {} } = {}) {
    let products = this.db.products.slice();

    if (!includeOutOfStock) {
      products = products.filter((product) => product.inStock !== false);
    }

    for (const [key, value] of Object.entries(filters)) {
      if (!value) {
        continue;
      }
      products = products.filter((product) => (product[key] || '').toString() === value.toString());
    }

    return clone(products).sort((a, b) => {
      const aKey = `${a.category || ''}|${a.brand || ''}|${a.model || ''}|${a.memory || ''}|${a.country || ''}`;
      const bKey = `${b.category || ''}|${b.brand || ''}|${b.model || ''}|${b.memory || ''}|${b.country || ''}`;
      return aKey.localeCompare(bKey, 'ru');
    });
  }

  getProductById(id) {
    return clone(this.db.products.find((product) => product.id === id) || null);
  }

  listCatalogValues(field, filters = {}) {
    const values = new Set();
    const products = this.getProducts({ filters });

    for (const product of products) {
      const value = (product[field] || '').trim();
      if (value) {
        values.add(value);
      }
    }

    return Array.from(values).sort((a, b) => a.localeCompare(b, 'ru'));
  }

  addProduct(payload) {
    const timestamp = now();
    const product = {
      id: createId('p'),
      category: payload.category || '',
      brand: payload.brand || '',
      model: payload.model || '',
      memory: payload.memory || '',
      country: payload.country || '',
      color: payload.color || '',
      price: Number(payload.price || 0),
      currency: payload.currency || 'RUB',
      inStock: payload.inStock !== false,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.products.push(product);
    this.save();
    return clone(product);
  }

  updateProduct(id, payload) {
    const product = this.db.products.find((entry) => entry.id === id);
    if (!product) {
      return null;
    }

    const keys = ['category', 'brand', 'model', 'memory', 'country', 'color', 'currency'];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        product[key] = payload[key] || '';
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'price')) {
      product.price = Number(payload.price || 0);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'inStock')) {
      product.inStock = Boolean(payload.inStock);
    }

    product.updatedAt = now();
    this.save();

    return clone(product);
  }

  deleteProduct(id) {
    const before = this.db.products.length;
    this.db.products = this.db.products.filter((entry) => entry.id !== id);
    const removed = this.db.products.length < before;

    if (removed) {
      this.save();
    }

    return removed;
  }

  upsertUser(from) {
    if (!from || !from.id) {
      return null;
    }

    const tgId = Number(from.id);
    let user = this.db.users.find((entry) => Number(entry.tgId) === tgId);
    const timestamp = now();

    if (!user) {
      user = {
        id: createId('u'),
        tgId,
        username: from.username || '',
        firstName: from.first_name || '',
        lastName: from.last_name || '',
        phone: '',
        note: '',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.db.users.push(user);
    } else {
      user.username = from.username || user.username || '';
      user.firstName = from.first_name || user.firstName || '';
      user.lastName = from.last_name || user.lastName || '';
      user.updatedAt = timestamp;
    }

    this.save();
    return clone(user);
  }

  addManualClient(payload) {
    const tgId = Number(payload.tgId);
    if (!Number.isFinite(tgId)) {
      return null;
    }

    const existing = this.db.users.find((entry) => Number(entry.tgId) === tgId);
    if (existing) {
      return this.updateUser(tgId, payload);
    }

    const timestamp = now();
    const user = {
      id: createId('u'),
      tgId,
      username: payload.username || '',
      firstName: payload.firstName || '',
      lastName: payload.lastName || '',
      phone: payload.phone || '',
      note: payload.note || '',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.db.users.push(user);
    this.save();
    return clone(user);
  }

  updateUser(tgId, payload) {
    const user = this.db.users.find((entry) => Number(entry.tgId) === Number(tgId));
    if (!user) {
      return null;
    }

    const keys = ['username', 'firstName', 'lastName', 'phone', 'note'];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        user[key] = payload[key] || '';
      }
    }

    user.updatedAt = now();
    this.save();
    return clone(user);
  }

  getUsers() {
    return clone(this.db.users).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getUserByTgId(tgId) {
    return clone(this.db.users.find((entry) => Number(entry.tgId) === Number(tgId)) || null);
  }

  addMessage(payload) {
    const message = {
      id: createId('m'),
      tgId: Number(payload.tgId),
      direction: payload.direction || 'in',
      text: payload.text || '',
      createdAt: now(),
    };

    if (!Number.isFinite(message.tgId)) {
      return null;
    }

    this.db.messages.push(message);
    this.save();
    return clone(message);
  }

  getMessagesByTgId(tgId, limit = 200) {
    return clone(
      this.db.messages
        .filter((entry) => Number(entry.tgId) === Number(tgId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-limit)
    );
  }

  addOffer(payload) {
    const offer = {
      id: createId('of'),
      tgId: Number(payload.tgId),
      type: payload.type || 'tradein',
      desiredProductId: payload.desiredProductId || '',
      offeredPrice: Number(payload.offeredPrice || 0),
      details: payload.details || {},
      contact: payload.contact || '',
      status: payload.status || 'new',
      createdAt: now(),
      updatedAt: now(),
    };

    if (!Number.isFinite(offer.tgId)) {
      return null;
    }

    this.db.offers.push(offer);
    this.save();
    return clone(offer);
  }

  getOffers(filters = {}) {
    let offers = this.db.offers.slice();

    if (filters.status) {
      offers = offers.filter((offer) => offer.status === filters.status);
    }

    if (filters.type) {
      offers = offers.filter((offer) => offer.type === filters.type);
    }

    return clone(offers).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateOfferStatus(id, status) {
    const offer = this.db.offers.find((entry) => entry.id === id);
    if (!offer) {
      return null;
    }

    offer.status = status;
    offer.updatedAt = now();
    this.save();

    return clone(offer);
  }

  addOrder(payload) {
    const order = {
      id: createId('or'),
      tgId: Number(payload.tgId),
      productId: payload.productId || '',
      offeredPrice: Number(payload.offeredPrice || 0),
      comment: payload.comment || '',
      contact: payload.contact || '',
      status: payload.status || 'new',
      createdAt: now(),
      updatedAt: now(),
    };

    if (!Number.isFinite(order.tgId)) {
      return null;
    }

    this.db.orders.push(order);
    this.save();
    return clone(order);
  }

  getOrders(filters = {}) {
    let orders = this.db.orders.slice();

    if (filters.status) {
      orders = orders.filter((order) => order.status === filters.status);
    }

    return clone(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  updateOrderStatus(id, status) {
    const order = this.db.orders.find((entry) => entry.id === id);
    if (!order) {
      return null;
    }

    order.status = status;
    order.updatedAt = now();
    this.save();

    return clone(order);
  }

  addLead(payload) {
    const lead = {
      id: createId('ld'),
      tgId: Number(payload.tgId),
      sourceType: payload.sourceType || '',
      sourceId: payload.sourceId || '',
      leadType: payload.leadType || 'buy',
      status: payload.status || 'new',
      triggerStage: Number(payload.triggerStage || 0),
      lastTriggerAt: payload.lastTriggerAt || '',
      managerComment: payload.managerComment || '',
      meta: payload.meta || {},
      createdAt: now(),
      updatedAt: now(),
    };

    if (!Number.isFinite(lead.tgId) || !lead.sourceType || !lead.sourceId) {
      return null;
    }

    this.db.leads.push(lead);
    this.save();
    return clone(lead);
  }

  getLeads(filters = {}) {
    let leads = this.db.leads.slice();

    if (filters.status) {
      leads = leads.filter((lead) => lead.status === filters.status);
    }

    if (filters.tgId) {
      leads = leads.filter((lead) => Number(lead.tgId) === Number(filters.tgId));
    }

    if (filters.sourceType) {
      leads = leads.filter((lead) => lead.sourceType === filters.sourceType);
    }

    return clone(leads).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getLeadById(id) {
    return clone(this.db.leads.find((lead) => lead.id === id) || null);
  }

  getLeadBySource(sourceType, sourceId) {
    return clone(
      this.db.leads.find((lead) => lead.sourceType === sourceType && lead.sourceId === sourceId) || null
    );
  }

  updateLead(id, payload) {
    const lead = this.db.leads.find((entry) => entry.id === id);
    if (!lead) {
      return null;
    }

    const keys = ['status', 'managerComment'];
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        lead[key] = payload[key] || '';
      }
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'triggerStage')) {
      lead.triggerStage = Number(payload.triggerStage || 0);
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'lastTriggerAt')) {
      lead.lastTriggerAt = payload.lastTriggerAt || '';
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'meta')) {
      lead.meta = payload.meta || {};
    }

    lead.updatedAt = now();
    this.save();
    return clone(lead);
  }

  closeLeadBySource(sourceType, sourceId, status = 'closed') {
    const lead = this.db.leads.find((entry) => entry.sourceType === sourceType && entry.sourceId === sourceId);
    if (!lead) {
      return null;
    }

    lead.status = status;
    lead.updatedAt = now();
    this.save();
    return clone(lead);
  }

  getUserRequests(tgId) {
    const offers = this.db.offers
      .filter((offer) => Number(offer.tgId) === Number(tgId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const orders = this.db.orders
      .filter((order) => Number(order.tgId) === Number(tgId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const leads = this.db.leads
      .filter((lead) => Number(lead.tgId) === Number(tgId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      offers: clone(offers),
      orders: clone(orders),
      leads: clone(leads),
    };
  }

  getStats() {
    const newOffers = this.db.offers.filter((offer) => offer.status === 'new').length;
    const newOrders = this.db.orders.filter((order) => order.status === 'new').length;
    const newLeads = this.db.leads.filter((lead) => lead.status === 'new').length;

    return {
      products: this.db.products.length,
      users: this.db.users.length,
      messages: this.db.messages.length,
      offers: this.db.offers.length,
      orders: this.db.orders.length,
      leads: this.db.leads.length,
      newOffers,
      newOrders,
      newLeads,
    };
  }
}

module.exports = { Store };
