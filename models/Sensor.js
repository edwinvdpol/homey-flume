'use strict';

const { filled } = require('../lib/Utils');

class Sensor {

  /**
   * Represents a beam.
   *
   * @constructor
   */
  constructor(data) {
    this.id = data.id;
    this.battery_level = data.battery_level?.toLowerCase();
    this.connected = data.connected;
    this.product = data.product;
    this.location = data.location;
  }

  /**
   * Return device capability values.
   *
   * @return {Object}
   */
  get capabilityValues() {
    if (!this.valid) return {};

    return Object.fromEntries(Object.entries({
      away_mode: this.location.away_mode || null,
      battery_level: this.battery_level || 'unknown',
      connected: this.connected || null,
    }).filter(([_, v]) => v || typeof v === 'boolean'));
  }

  /**
   * Return device data.
   *
   * @return {Object}
   */
  get data() {
    if (!this.valid) return {};

    return {
      name: this.location.name,
      data: {
        id: this.id,
      },
      settings: this.settings,
      store: this.store,
    };
  }

  /**
   * Return device settings.
   *
   * @return {{
   *  product_name: string,
   *  away_mode: boolean
   * }}
   */
  get settings() {
    if (!this.valid) return {};

    return {
      away_mode: this.location.away_mode || false,
      product_name: this.product || '-',
    };
  }

  /**
   * Return device store.
   *
   * @return {Object}
   */
  get store() {
    if (!this.valid) return {};

    return {
      location_id: this.location.id || '-',
      timezone: this.location.tz || '-',
    };
  }

  /**
   * Return whether device is valid.
   *
   * @return {boolean}
   */
  get valid() {
    return filled(this.id) && filled(this.location);
  }

}

module.exports = Sensor;
