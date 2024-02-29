'use strict';

const Device = require('../../lib/Device');
const { blank, filled } = require('../../lib/Utils');
const { Notification } = require('../../lib/Enums');

class SensorDevice extends Device {

  /*
  | Device events
  */

  // Device initialized
  async onOAuth2Init() {
    this.heartbeat_notification_id = 0;
    this.battery_notification_id = 0;
    this.budget_notification_id = 0;
    this.usage_notification_id = 0;
    this.leak_notification_id = 0;

    await super.onOAuth2Init();
  }

  // Settings changed
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('[Settings] Updating');

    // Away mode updated
    if (changedKeys.includes('away_mode')) {
      const mode = newSettings.away_mode;

      this.log(`Away Mode is now '${mode}'`);

      await this.setAwayMode(mode);

      this.setCapabilityValue('away_mode', mode).catch(this.error);
    }

    this.log('[Settings] Updated');
  }

  /*
  | Synchronization functions
  */

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

    // Get latest messages of each type
    const leak = messages.where('extra.event_rule_name', 'Flume Smart Leak Alert').first();
    const usage = messages.where('extra.event_rule_name', 'High Flow Alert').first();
    const heartbeat = messages.where('type', Notification.heartbeat).first();
    const battery = messages.where('type', Notification.battery).first();
    const budget = messages.where('type', Notification.budget).first();

    // Handle messages
    await this.handleHeartbeatMessage(heartbeat);
    await this.handleBatteryMessage(battery);
    await this.handleBudgetMessage(budget);
    await this.handleUsageMessage(usage);
    await this.handleLeakMessage(leak);

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

}

module.exports = SensorDevice;
