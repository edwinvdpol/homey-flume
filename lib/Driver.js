'use strict';

const Homey = require('homey');
const { OAuth2Driver } = require('homey-oauth2app');
const OAuth2Util = require('homey-oauth2app/lib/OAuth2Util');
const { blank } = require('./Utils');
const { DeviceType } = require('./Enums');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Driver destroyed
  async onOAuth2Uninit() {
    this.log('Destroyed');
  }

  /*
  | Pairing functions
  */

  // Pair
  onPair(session) {
    const OAuth2ConfigId = this.getOAuth2ConfigId();

    let OAuth2SessionId = '$new';
    let client = this.homey.app.createOAuth2Client({
      sessionId: OAuth2Util.getRandomId(),
      configId: OAuth2ConfigId,
    });

    const savedSessions = this.homey.app.getSavedOAuth2Sessions();

    if (Object.keys(savedSessions).length) {
      OAuth2SessionId = Object.keys(savedSessions)[0];

      try {
        client = this.homey.app.getOAuth2Client({
          configId: OAuth2ConfigId,
          sessionId: OAuth2SessionId,
        });
      } catch (err) {
        this.error('[Pair]', err.toString());
      }
    }

    const onShowView = async (viewId) => {
      if (viewId === 'credentials' && OAuth2SessionId !== '$new') {
        session.nextView().catch(this.error);
      }
    };

    const onLogin = async ({
      clientId, clientSecret, username, password,
    }) => {
      this.homey.settings.set(Homey.env.FLUME_CLIENT_ID_SETTING, clientId);
      this.homey.settings.set(Homey.env.FLUME_CLIENT_SECRET_SETTING, clientSecret);

      try {
        await client.getTokenByCredentials({ username, password });
      } catch (err) {
        this.error('[Pair]', err.toString());
        throw new Error(this.homey.__(`error.${err.message}`) || err.message);
      }

      const session = await client.onGetOAuth2SessionInformation();

      OAuth2SessionId = session.id;
      const token = client.getToken();
      const { title } = session;

      client.destroy();

      // replace the temporary client by the final one and save it
      client = this.homey.app.createOAuth2Client({
        sessionId: session.id,
        configId: OAuth2ConfigId,
      });

      client.setTitle({ title });
      client.setToken({ token });

      return true;
    };

    const onListDevices = async () => {
      const devices = await this.onPairListDevices({
        oAuth2Client: client,
      });

      return devices.map((device) => {
        return {
          ...device,
          store: {
            ...device.store,
            OAuth2SessionId,
            OAuth2ConfigId,
          },
        };
      });
    };

    const onAddDevice = async () => {
      this.log('At least one device has been added, saving the client...');

      client.save();
    };

    const onDisconnect = async () => {
      this.log('Pair session disconnected');
    };

    session
      .setHandler('showView', onShowView)
      .setHandler('login', onLogin)
      .setHandler('list_devices', onListDevices)
      .setHandler('add_device', onAddDevice)
      .setHandler('disconnect', onDisconnect);
  }

  // Pair devices
  async onPairListDevices({ oAuth2Client }) {
    this.log(`Pairing ${this.id}s`);

    const devices = await oAuth2Client.getDevices(DeviceType.sensor);

    if (blank(devices)) return [];

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

  /**
   * @param {PairSession} session
   * @param {SensorDevice|Device} device
   */
  onRepair(session, device) {
    this.log('[Repair] Session connected');

    let client;

    let {
      OAuth2SessionId,
      OAuth2ConfigId,
    } = device.getStore();

    if (!OAuth2SessionId) {
      OAuth2SessionId = OAuth2Util.getRandomId();
    }

    if (!OAuth2ConfigId) {
      OAuth2ConfigId = this.getOAuth2ConfigId();
    }

    try {
      client = this.homey.app.getOAuth2Client({
        sessionId: OAuth2SessionId,
        configId: OAuth2ConfigId,
      });
    } catch (err) {
      client = this.homey.app.createOAuth2Client({
        sessionId: OAuth2SessionId,
        configId: OAuth2ConfigId,
      });
    }

    const onLogin = async ({
      clientId, clientSecret, username, password,
    }) => {
      let originalClientID = this.homey.settings.get(Homey.env.FLUME_CLIENT_ID_SETTING);
      let originalClientSecret = this.homey.settings.get(Homey.env.FLUME_CLIENT_SECRET_SETTING);

      try {
        this.homey.settings.set(Homey.env.FLUME_CLIENT_ID_SETTING, clientId);
        this.homey.settings.set(Homey.env.FLUME_CLIENT_SECRET_SETTING, clientSecret);

        await client.getTokenByCredentials({ username, password });
        await device.onOAuth2Uninit();
        await device.setStoreValue('OAuth2SessionId', OAuth2SessionId);
        await device.setStoreValue('OAuth2ConfigId', OAuth2ConfigId);
        await client.save();

        device.oAuth2Client = client;

        await device.onOAuth2Init();

        await session.done();
      } catch (err) {
        this.error('[Repair]', err.toString());

        this.homey.settings.set(Homey.env.FLUME_CLIENT_ID_SETTING, originalClientID);
        this.homey.settings.set(Homey.env.FLUME_CLIENT_SECRET_SETTING, originalClientSecret);

        throw new Error(this.homey.__(`error.${err.message}`) || err.message);
      } finally {
        originalClientID = null;
        originalClientSecret = null;
      }
    };

    const onDisconnect = async () => {
      this.log('[Repair] Session disconnected');
    };

    session
      .setHandler('login', onLogin)
      .setHandler('disconnect', onDisconnect);
  }

  // Return data to create the device
  getDeviceData(device) {
    if (blank(device.location)) return {};

    const data = {
      name: device.location.name,
      data: {
        id: device.id,
      },
      settings: {
        product_name: device.product,
        away_mode: device.location.away_mode,
      },
      store: {
        location_id: device.location.id,
        timezone: device.location.tz,
      },
    };

    this.log('Device found', JSON.stringify(data));

    return data;
  }

}

module.exports = Driver;
