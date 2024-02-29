/* eslint-disable camelcase */

'use strict';

const { OAuth2App } = require('homey-oauth2app');
const { Log } = require('homey-log');
const { collect } = require('collect.js');
const { blank, filled } = require('./Utils');
const Client = require('./Client');

class App extends OAuth2App {

  static OAUTH2_CLIENT = Client;
  static SYNC_INTERVAL = 5; // Minutes

  /*
  | Application events
  */

  // Application initialized
  async onOAuth2Init() {
    // Sentry logging
    this.homeyLog = new Log({ homey: this.homey });

    // Register event listener
    this.homey.on('unload', () => this.onUninit());

    // Set default data
    this.setDefaults();

    // Register flow cards
    this.registerFlowCards();

    this.log('Initialized');
  }

  // Application destroyed
  async onUninit() {
    // Unregister timer
    this.unregisterTimer();

    // Clear data
    this.setDefaults();

    this.log('Destroyed');
  }

  /*
  | Synchronization functions
  */

  // Synchronize
  async sync(id = null) {
    if (this.syncing) return;
    this.syncing = true;

    let client;

    try {
      // Get client
      client = await this.getSavedOAuth2Client();

      this.log('[Sync] Started');

      // Synchronize data
      if (!this.hasSyncData() || blank(id)) {
        await this.syncData(client);
      }

      // Synchronize device(s)
      this.homey.emit('sync', id);
    } catch (err) {
      if (err.message !== 'No OAuth2 Client Found') {
        this.error('[Sync]', err.toString());
      }
    } finally {
      // Register timer
      this.registerTimer();

      this.syncing = false;
      client = null;
    }
  }

  // Synchronize API data
  async syncData(client) {
    let devices = await client.getDevices();
    let notifications = await client.getNotifications();

    this.devices = collect(devices).keyBy('id').all();
    this.notifications = collect(notifications).groupBy('device_id').all();

    devices = null;
    notifications = null;
  }

  // Synchronization data available
  hasSyncData() {
    return filled(this.devices) || filled(this.notifications);
  }

  /*
  | Flow card functions
  */

  // Register flow cards
  registerFlowCards() {
    this.log('[FlowCards] Registering');

    this.registerActionFlowCards();
    this.registerConditionFlowCards();
    this.registerDeviceTriggerFlowCards();

    this.log('[FlowCards] Registered');
  }

  // Register action flow cards
  registerActionFlowCards() {
    // ... then turn off away mode ...
    this.homey.flow.getActionCard('away_mode_false').registerRunListener(async ({ device }) => {
      await device.setAwayMode(false);
    });

    // ... then turn on away mode ...
    this.homey.flow.getActionCard('away_mode_true').registerRunListener(async ({ device }) => {
      await device.setAwayMode(true);
    });
  }

  // Register condition flow cards
  registerConditionFlowCards() {
    // ... and budget alarm is ...
    this.homey.flow.getConditionCard('alarm_budget').registerRunListener(async ({ device, alarm_budget }) => {
      return device.getCapabilityValue('alarm_budget') === alarm_budget;
    });

    // ... and leakage alarm is ...
    this.homey.flow.getConditionCard('alarm_leak').registerRunListener(async ({ device, alarm_leak }) => {
      return device.getCapabilityValue('alarm_leak') === alarm_leak;
    });

    // ... and usage alarm is ...
    this.homey.flow.getConditionCard('alarm_usage').registerRunListener(async ({ device, alarm_usage }) => {
      return device.getCapabilityValue('alarm_usage') === alarm_usage;
    });

    // ... and away mode is ...
    this.homey.flow.getConditionCard('away_mode').registerRunListener(async ({ device, away_mode }) => {
      return device.getCapabilityValue('away_mode') === away_mode;
    });

    // ... and battery level is ...
    this.homey.flow.getConditionCard('battery_level').registerRunListener(async ({ device, battery_level }) => {
      return device.getCapabilityValue('battery_level') === battery_level;
    });

    // ... and connected is ...
    this.homey.flow.getConditionCard('connected').registerRunListener(async ({ device, connected }) => {
      return device.getCapabilityValue('connected') === connected;
    });
  }

  // Register device trigger flow cards
  registerDeviceTriggerFlowCards() {
    // ... When battery level changed to ...
    this.homey.flow.getDeviceTriggerCard('battery_level_changed').registerRunListener(async ({ device, battery_level }) => {
      return device.getCapabilityValue('battery_level') === battery_level;
    });
  }

  /*
  | Timer functions
  */

  // Register timer
  registerTimer() {
    if (this.syncTimer) return;

    const interval = 1000 * 60 * this.constructor.SYNC_INTERVAL;

    this.syncTimer = this.homey.setInterval(this.sync.bind(this), interval);

    this.log('[Timer] Registered');
  }

  // Unregister timer
  unregisterTimer() {
    if (!this.syncTimer) return;

    this.homey.clearInterval(this.syncTimer);

    this.syncTimer = null;

    this.log('[Timer] Unregistered');
  }

  /*
  | Support functions
  */

  async getSavedOAuth2Client() {
    try {
      return this.getFirstSavedOAuth2Client();
    } catch (err) {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return this.getFirstSavedOAuth2Client();
    }
  }

  // Set default data
  setDefaults() {
    this.syncing = null;
    this.devices = null;
    this.notifications = null;
  }

}

module.exports = App;
