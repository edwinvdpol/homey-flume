'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const { blank, filled } = require('./Utils');
const { Notification } = require('./Enums');

class Device extends OAuth2Device {

  static SYNC_INTERVAL = 5; // Minutes

  /*
  | Device events
  */

  // Device added
  async onOAuth2Added() {
    this.log('Added');
  }

  // Device deleted
  async onOAuth2Deleted() {
    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Set default data
    this.setDefaults();

    // Register event listeners
    this.registerEventListeners();

    // Register timer
    this.registerTimer();

    // Wait for application
    await this.homey.ready();

    // Synchronize
    await this.homey.app.sync(this.getData().id);

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    // Unregister timer
    this.unregisterTimer();

    // Unregister event listeners
    await this.unregisterEventListeners();

    this.log('Destroyed');
  }

  // Device settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('[Settings] Updating');

    for (const name of changedKeys) {
      const newValue = newSettings[name];

      this.log(`[Settings] '${name}' is now '${newValue}'`);

      // Away mode
      if (name === 'away_mode') {
        await this.setAwayMode(newValue);

        this.setCapabilityValue('away_mode', newValue).catch(this.error);
      }
    }

    this.log('[Settings] Updated');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync(id = null) {
    try {
      await this.syncDevice();
      await this.syncNotifications();

      if (id === this.getData().id) {
        await this.syncUsage();
      }

      this.setAvailable().catch(this.error);
    } catch (err) {
      this.error('[Sync]', err.toString());
      this.setUnavailable(err.message).catch(this.error);
    }
  }

  // Synchronize device
  async syncDevice() {
    const settings = {};
    const { id } = this.getData();

    let data = this.homey.app.devices[id] || {};
    if (blank(data)) return;

    // Battery level
    if ('battery_level' in data) {
      const level = data.battery_level.toLowerCase();

      this.setCapabilityValue('battery_level', level).catch(this.error);
    }

    // Away mode
    if ('away_mode' in data.location) {
      const enabled = data.location.away_mode;

      this.setCapabilityValue('away_mode', enabled).catch(this.error);

      settings.away_mode = enabled;
    }

    // Update settings
    if (filled(settings)) {
      this.setSettings(settings).catch(this.error);
    }

    data = null;
  }

  // Synchronize notifications
  async syncNotifications() {
    const { id } = this.getData();

    // Messages are sorted from new to old
    let messages = this.homey.app.notifications[id] || [];
    if (blank(messages)) return;

    // Handle messages
    await this.handleHeartbeatMessage(messages.where('type', Notification.heartbeat).first());
    await this.handleBatteryMessage(messages.where('type', Notification.battery).first());
    await this.handleBudgetMessage(messages.where('type', Notification.budget).first());
    await this.handleUsageMessage(messages.where('extra.event_rule_name', 'High Flow Alert').first());
    await this.handleLeakMessage(messages.where('extra.event_rule_name', 'Flume Smart Leak Alert').first());

    messages = null;
  }

  // Synchronize usage
  async syncUsage() {
    let data;

    try {
      this.log('[Sync] Device usage');

      // Get device usage
      data = await this.oAuth2Client.getDeviceUsage(
        this.getData().id,
        this.constructor.SYNC_INTERVAL,
        this.getStoreValue('timezone'),
      );
    } catch (err) {
      this.error('[Sync]', err.toString());
      data = {};
    }

    if (blank(data)) return;

    // Measure water
    if ('measure_water' in data) {
      const measure = Math.round((data.measure_water + Number.EPSILON) * 100) / 100;

      this.setCapabilityValue('measure_water', measure).catch(this.error);
    }

    // Meter water
    if ('meter_water' in data) {
      const meter = Math.round((data.meter_water + Number.EPSILON) * 1000) / 1000;

      this.setCapabilityValue('meter_water', meter).catch(this.error);
    }

    data = null;
  }

  /*
  | Handle message functions
  */

  // Handle battery message
  async handleBatteryMessage(message) {
    if (blank(message)) {
      this.setCapabilityValue('alarm_battery', false).catch(this.error);

      return;
    }

    // Battery alarm
    this.setCapabilityValue('alarm_battery', !message.read).catch(this.error);

    // Log notification
    if (!message.read) {
      this.log('[Low Battery Detected]', JSON.stringify(message));
    } else if (this.battery_notification_id !== message.id) {
      this.log('[Low Battery Message]', JSON.stringify(message));
    }

    this.battery_notification_id = message.id;
  }

  // Handle budget message
  async handleBudgetMessage(message) {
    if (blank(message)) {
      this.setCapabilityValue('alarm_budget', false).catch(this.error);

      return;
    }

    // Budget alarm
    this.setCapabilityValue('alarm_budget', !message.read).catch(this.error);

    // Log notification
    if (!message.read) {
      this.log('[Budget Alert Detected]', JSON.stringify(message));
    } else if (this.budget_notification_id !== message.id) {
      this.log('[Budget Alert Message]', JSON.stringify(message));
    }

    this.budget_notification_id = message.id;
  }

  // Handle heartbeat message
  async handleHeartbeatMessage(message) {
    if (blank(message)) {
      this.setCapabilityValue('connected', true).catch(this.error);

      return;
    }

    const { connected } = message.extra;

    // Connected
    this.setCapabilityValue('connected', connected).catch(this.error);

    // Known notification
    if (this.heartbeat_notification_id === message.id) {
      return;
    }

    // Log notification
    if (connected) {
      this.log('[Online]', JSON.stringify(message));
    } else {
      this.log('[Offline]', JSON.stringify(message));
    }

    this.heartbeat_notification_id = message.id;
  }

  // Handle leak message
  async handleLeakMessage(message) {
    if (blank(message)) {
      this.setCapabilityValue('alarm_leak', false).catch(this.error);

      return;
    }

    // Water leakage alarm
    this.setCapabilityValue('alarm_leak', !message.read).catch(this.error);

    // Log notification
    if (!message.read) {
      this.log('[Leak Detected]', JSON.stringify(message));
    } else if (this.leak_notification_id !== message.id) {
      this.log('[Leak Message]', JSON.stringify(message));
    }

    this.leak_notification_id = message.id;
  }

  // Handle usage message
  async handleUsageMessage(message) {
    if (blank(message)) {
      this.setCapabilityValue('alarm_usage', false).catch(this.error);

      return;
    }

    // Water usage alarm
    this.setCapabilityValue('alarm_usage', !message.read).catch(this.error);

    // Log notification
    if (!message.read) {
      this.log('[High Usage Detected]', JSON.stringify(message));
    } else if (this.usage_notification_id !== message.id) {
      this.log('[High Usage Message]', JSON.stringify(message));
    }

    this.usage_notification_id = message.id;
  }

  /*
  | Command functions
  */

  // Control away mode
  async setAwayMode(enable) {
    return this.oAuth2Client.setAwayMode(this.getStoreValue('location_id'), enable);
  }

  /*
  | Listener functions
  */

  // Register event listeners
  registerEventListeners() {
    if (this.onSync) return;

    this.onSync = this.sync.bind(this);

    this.homey.on('sync', this.onSync);

    this.log('[Listeners] Registered');
  }

  // Unregister event listeners
  async unregisterEventListeners() {
    if (!this.onSync) return;

    this.homey.off('sync', this.onSync);

    this.onSync = null;

    this.log('[Listeners] Unregistered');
  }

  /*
  | Timer functions
  */

  // Register timer
  registerTimer() {
    if (this.syncUsageTimer) return;

    const interval = 1000 * 60 * this.constructor.SYNC_INTERVAL;

    this.syncUsageTimer = this.homey.setInterval(this.syncUsage.bind(this), interval);

    this.log('[Timer] Registered');
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncUsageTimer) return;

    this.homey.clearInterval(this.syncUsageTimer);

    this.syncUsageTimer = null;

    this.log('[Timer] Unregistered');
  }

  /*
  | Support functions
  */

  // Set default data
  setDefaults() {
    this.heartbeat_notification_id = 0;
    this.battery_notification_id = 0;
    this.budget_notification_id = 0;
    this.usage_notification_id = 0;
    this.leak_notification_id = 0;
  }

}

module.exports = Device;
