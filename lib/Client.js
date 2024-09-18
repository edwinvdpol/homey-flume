'use strict';

const fetch = require('node-fetch');
const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');
const { URLSearchParams } = require('url');
const { DateTime } = require('luxon');
const { filled } = require('./Utils');
const { Bucket, DeviceType } = require('./Enums');
const Sensor = require('../models/Sensor');

class Client extends OAuth2Client {

  static API_URL = 'https://api.flumewater.com';
  static TOKEN_URL = 'https://api.flumewater.com/oauth/token?envelope=false';
  static AUTHORIZATION_URL = '';
  static SCOPES = [];

  /*
  | Device functions
  */

  // Return active sensor devices
  async discoverDevices() {
    const devices = await this.getDevices();

    return devices
      .filter((device) => device.valid)
      .map((device) => device.data)
      .filter((e) => e);
  }

  // Return all sensor devices
  async getDevices() {
    const devices = await this._get(`devices?location=true&type=${DeviceType.sensor}`);

    return devices.map((data) => new Sensor(data));
  }

  // Return device usage
  async getDeviceUsage(id, interval, timezone) {
    const data = await this._post(`devices/${id}/query`, this._queries(interval, timezone));

    return this._processUsage(data);
  }

  // Return all notifications
  async getNotifications() {
    return this._get('notifications?limit=2000&sort_field=created_datetime&sort_direction=DESC', false);
  }

  // Update away mode for given location
  async setAwayMode(id, mode) {
    return this._patch(`locations/${id}`, { away_mode: mode });
  }

  /*
  | Support functions
  */

  // Perform GET request
  async _get(path, log = true) {
    path = `/me/${path}`;

    if (log) this.log('GET', path);

    const result = await this.get({
      path,
      query: '',
      headers: {},
    });

    return result.data || [];
  }

  // Perform PATCH request
  async _patch(path, json = null) {
    path = `/me/${path}`;

    this.log('PATCH', path, JSON.stringify(json));

    const result = await this.patch({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });

    return result.success;
  }

  // Perform POST request
  async _post(path, json = null) {
    path = `/me/${path}`;

    this.log('POST', path, JSON.stringify(json));

    const result = await this.post({
      path,
      query: '',
      json,
      body: null,
      headers: {},
    });

    return result.data[0] || {};
  }

  // Process usage
  _processUsage(usage) {
    const values = {};

    Object.keys(usage).forEach((key) => {
      const entry = usage[key];

      if (entry && entry[0] && filled(entry[0].value)) {
        values[key] = entry[0].value;
      }
    });

    return values;
  }

  // Usage queries
  _queries(minutes, timezone) {
    const currentTime = DateTime.local().setZone(timezone);
    const minutesInPast = currentTime.minus({ minutes });

    const since = minutesInPast.startOf('minute').toFormat('yyyy-MM-dd HH:mm:ss');
    const until = currentTime.startOf('minute').toFormat('yyyy-MM-dd HH:mm:ss');

    return {
      queries: [
        {
          request_id: 'meter_water',
          bucket: Bucket.minute,
          since_datetime: since,
          until_datetime: until,
          operation: 'SUM',
          units: 'CUBIC_METERS',
        },
        {
          request_id: 'measure_water',
          bucket: Bucket.minute,
          since_datetime: since,
          until_datetime: until,
          operation: 'AVG',
          units: 'LITERS',
        },
      ],
    };
  }

  /*
  | Client events
  */

  // Client initialized
  async onInit() {
    this.log('Initialized');
  }

  // Client destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  // Get token by credentials
  async onGetTokenByCredentials({ username, password }) {
    const body = new URLSearchParams();
    body.append('grant_type', 'password');
    body.append('username', username);
    body.append('password', password);
    body.append('client_id', this.homey.settings.get(Homey.env.FLUME_CLIENT_ID_SETTING) || '');
    body.append('client_secret', this.homey.settings.get(Homey.env.FLUME_CLIENT_SECRET_SETTING) || '');

    const response = await fetch(this._tokenUrl, {
      body,
      method: 'POST',
    });
    if (!response.ok) {
      return this.onHandleGetTokenByCredentialsError({ response });
    }

    this._token = await this.onHandleGetTokenByCredentialsResponse({ response });
    return this.getToken();
  }

  // Request response is not OK
  async onHandleNotOK({
    body, status, statusText, headers,
  }) {
    this.error('Request not OK', JSON.stringify({
      body,
      status,
      statusText,
      headers,
    }));

    // Client errors
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      return new Error(this.homey.__(`error.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      return new Error(this.homey.__('error.50x'));
    }

    // Custom error message
    if (!body.success && filled(body.message)) {
      return new Error(body.message);
    }

    // Unknown error
    return new Error(this.homey.__('error.unknown'));
  }

  // Handle result
  async onHandleResult({
    result, status, statusText, headers,
  }) {
    if (typeof result === 'object') {
      this.log('[Response]', JSON.stringify(result));

      return result;
    }

    this.error('[Response]', result);

    throw new Error(this.homey.__('error.50x'));
  }

  // Refresh token
  async onRefreshToken() {
    this._clientId = this.homey.settings.get(Homey.env.FLUME_CLIENT_ID_SETTING) || '';
    this._clientSecret = this.homey.settings.get(Homey.env.FLUME_CLIENT_SECRET_SETTING) || '';

    return super.onRefreshToken();
  }

  // Request error
  async onRequestError({ err }) {
    this.error('[Request]', err.toString());

    throw new Error(this.homey.__('error.network'));
  }

}

module.exports = Client;
