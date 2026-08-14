import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

class RateLimiter {
  constructor(maxDailyLimit = 5) {
    this.maxDailyLimit = maxDailyLimit;
    this.ensureDataFile();
  }

  ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(USAGE_FILE)) {
      fs.writeFileSync(USAGE_FILE, JSON.stringify({ records: {}, config: { maxDailyLimit: 5 } }, null, 2));
    }
  }

  getTodayKey() {
    return new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  }

  loadData() {
    try {
      this.ensureDataFile();
      const content = fs.readFileSync(USAGE_FILE, 'utf-8');
      return JSON.parse(content);
    } catch (err) {
      console.error('Error reading usage data:', err);
      return { records: {}, config: { maxDailyLimit: this.maxDailyLimit } };
    }
  }

  saveData(data) {
    try {
      fs.writeFileSync(USAGE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Error saving usage data:', err);
    }
  }

  cleanPhoneNumber(rawNumber) {
    if (!rawNumber) return 'Unknown';
    return rawNumber.replace(/@c\.us|@g\.us|@s\.whatsapp\.net/g, '').replace(/[^0-9+]/g, '');
  }

  canAccess(phoneNumber) {
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const today = this.getTodayKey();
    const data = this.loadData();
    const limit = data.config?.maxDailyLimit || this.maxDailyLimit;

    if (!data.records[cleanNumber]) {
      return { allowed: true, count: 0, limit, remaining: limit };
    }

    const userRecord = data.records[cleanNumber];
    if (userRecord.lastDate !== today) {
      return { allowed: true, count: 0, limit, remaining: limit };
    }

    const currentCount = userRecord.count || 0;
    const allowed = currentCount < limit;
    return {
      allowed,
      count: currentCount,
      limit,
      remaining: Math.max(0, limit - currentCount)
    };
  }

  recordAccess(phoneNumber, pushName = '') {
    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const today = this.getTodayKey();
    const data = this.loadData();

    if (!data.records[cleanNumber] || data.records[cleanNumber].lastDate !== today) {
      data.records[cleanNumber] = {
        name: pushName || cleanNumber,
        count: 1,
        lastDate: today,
        lastTimestamp: new Date().toISOString(),
        history: [{ date: today, timestamp: new Date().toISOString() }]
      };
    } else {
      data.records[cleanNumber].count += 1;
      data.records[cleanNumber].name = pushName || data.records[cleanNumber].name || cleanNumber;
      data.records[cleanNumber].lastTimestamp = new Date().toISOString();
      if (!data.records[cleanNumber].history) data.records[cleanNumber].history = [];
      data.records[cleanNumber].history.push({ date: today, timestamp: new Date().toISOString() });
    }

    this.saveData(data);
    return data.records[cleanNumber];
  }

  getUsageStats() {
    const data = this.loadData();
    const today = this.getTodayKey();
    const limit = data.config?.maxDailyLimit || this.maxDailyLimit;

    const userList = Object.entries(data.records).map(([number, record]) => {
      const isToday = record.lastDate === today;
      const count = isToday ? record.count : 0;
      return {
        number,
        name: record.name || number,
        countToday: count,
        limit,
        remaining: Math.max(0, limit - count),
        status: count >= limit ? 'LIMIT_REACHED' : count > 0 ? 'ACTIVE' : 'IDLE',
        lastTimestamp: record.lastTimestamp
      };
    });

    return {
      today,
      maxDailyLimit: limit,
      totalUsers: userList.length,
      activeToday: userList.filter(u => u.countToday > 0).length,
      users: userList.sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp))
    };
  }

  setDailyLimit(newLimit) {
    const data = this.loadData();
    this.maxDailyLimit = Number(newLimit);
    if (!data.config) data.config = {};
    data.config.maxDailyLimit = Number(newLimit);
    this.saveData(data);
  }
}

export default new RateLimiter();
