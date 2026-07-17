const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');

const file = path.join(__dirname, '../database.json');
const adapter = new FileSync(file);
const db = low(adapter);

// Muundo wa awali wa database (kama tables)
db.defaults({
  users: [],
  students: [],
  attendances: [],
  marks: [],
  fees: [],
  homeworks: [],
  announcements: [],
}).write();

function matchesWhere(item, where) {
  if (!where) return true;
  return Object.keys(where).every((key) => item[key] === where[key]);
}

function omitFields(item, excludeFields) {
  if (!excludeFields || !excludeFields.length) return item;
  const copy = { ...item };
  excludeFields.forEach((f) => delete copy[f]);
  return copy;
}

// "Model" inayoiga tabia ya Sequelize (create, findAll, findOne, findByPk, update, destroy, bulkCreate)
// ili routes zilizoandikwa awali ziendelee kufanya kazi bila kubadilika
function Model(collection) {
  return {
    create: (data) => {
      const items = db.get(collection).value();
      const id = items.reduce((m, i) => Math.max(m, i.id || 0), 0) + 1;
      const record = { id, ...data, createdAt: new Date().toISOString() };
      items.push(record);
      db.write();
      return record;
    },

    bulkCreate: (records) => {
      const items = db.get(collection).value();
      let id = items.reduce((m, i) => Math.max(m, i.id || 0), 0);
      const created = records.map((r) => ({ id: ++id, ...r, createdAt: new Date().toISOString() }));
      items.push(...created);
      db.write();
      return created;
    },

    findAll: (query = {}) => {
      let items = db.get(collection).value();
      if (query.where) items = items.filter((i) => matchesWhere(i, query.where));
      if (query.order) {
        const [field, dir] = query.order[0];
        items = [...items].sort((a, b) => {
          if (a[field] < b[field]) return dir === 'DESC' ? 1 : -1;
          if (a[field] > b[field]) return dir === 'DESC' ? -1 : 1;
          return 0;
        });
      }
      if (query.attributes && query.attributes.exclude) {
        items = items.map((i) => omitFields(i, query.attributes.exclude));
      }
      return items;
    },

    findOne: (query = {}) => {
      const items = db.get(collection).value().filter((i) => matchesWhere(i, query.where));
      return items[0] || null;
    },

    findByPk: (id) => {
      const items = db.get(collection).value();
      return items.find((i) => i.id === Number(id)) || null;
    },

    update: (data, query) => {
      const items = db.get(collection).value();
      items.filter((i) => matchesWhere(i, query.where)).forEach((i) => Object.assign(i, data));
      db.write();
      return true;
    },

    destroy: (query) => {
      const items = db.get(collection).value();
      const remaining = items.filter((i) => !matchesWhere(i, query.where));
      const removedCount = items.length - remaining.length;
      db.set(collection, remaining).write();
      return removedCount;
    },
  };
}

module.exports = { Model, db };
