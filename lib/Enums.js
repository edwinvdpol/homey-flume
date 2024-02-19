'use strict';

module.exports = {
  Bucket: {
    minute: 'MIN',
    hour: 'HR',
    day: 'DAY',
    month: 'MON',
    year: 'YR',
  },
  DeviceType: {
    bridge: 1,
    sensor: 2,
  },
  Notification: {
    usage: 1,
    budget: 2,
    general: 4,
    heartbeat: 8,
    battery: 16,
  },
};
