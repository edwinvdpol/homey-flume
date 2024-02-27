'use strict';

const { OAuth2Device } = require('homey-oauth2app');

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
    // Unregister event listener
    this.homey.off('sync', this.sync);

    // Unregister timer
    this.unregisterTimer();

    this.log('Deleted');
  }

  // Device initialized
  async onOAuth2Init() {
    // Wait for application
    await this.homey.ready();

    // Register event listener
    this.homey.on('sync', this.sync.bind(this));

    // Register timer
    this.registerTimer();

    // Synchronize
    await this.homey.app.sync(this.getData().id);

    this.log('Initialized');
  }

  // Device destroyed
  async onOAuth2Uninit() {
    // Unregister event listener
    this.homey.off('sync', this.sync);

    this.log('Destroyed');
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

}

module.exports = Device;
