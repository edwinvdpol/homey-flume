'use strict';

const fetch = require('node-fetch');
const Homey = require('homey');
const { OAuth2Client } = require('homey-oauth2app');
const { URLSearchParams } = require('url');
const { DateTime } = require('luxon');
const { filled, blank } = require('./Utils');
const { Bucket } = require('./Enums');

class Client extends OAuth2Client {

  static API_URL = 'https://api.flumewater.com';
  static TOKEN_URL = 'https://api.flumewater.com/oauth/token?envelope=false';
  static AUTHORIZATION_URL = '';
  static SCOPES = [];

  /*
  | Device functions
  */

  // Return device data
  async getDeviceData(id) {
    const data = await this._get(`devices/${id}?location=true`);

    return data[0] || {};
  }

  // Return device usage
  async getDeviceUsage(id, interval, timezone) {
    let data = await this._post(`devices/${id}/query`, this._queries(interval, timezone));
    const values = {};

    Object.keys(data).forEach((key) => {
      const entry = data[key];

      if (entry && entry[0] && filled(entry[0].value)) {
        values[key] = entry[0].value;
      }
    });

    data = null;

    return values;
  }

  // Return all devices
  async getDevices(type = null) {
    let url = 'devices?location=true';

    if (type !== null) {
      url += `&type=${type}`;
    }

    return this._get(url);
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
    this.log('[Token] Requesting');

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
    
    this.log('[Token] Result:', JSON.stringify(this._token));

    // Return token
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

    let error;

    // Client errors
    if (status === 400 || status === 401 || status === 403 || status === 404) {
      error = new Error(this.homey.__(`error.${status}`));
    }

    // Internal server error
    if (status >= 500 && status < 600) {
      error = new Error(this.homey.__('error.50x'));
    }

    // Custom error message
    if (body && !body.success && filled(body.message)) {
      error = new Error(body.message);
    }

    // Unknown error
    if (blank(error)) {
      error = new Error(this.homey.__('error.unknown'));
    }

    error.status = status;
    error.statusText = statusText;

    return error;
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
    this.log('[Token] Refreshing');

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
