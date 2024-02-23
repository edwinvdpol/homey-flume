'use strict';

const Homey = require('homey');
const { OAuth2Driver } = require('homey-oauth2app');
const OAuth2Util = require('homey-oauth2app/lib/OAuth2Util');
const { blank } = require('./Utils');

class Driver extends OAuth2Driver {

  /*
  | Driver events
  */

  // Driver initialized
  async onOAuth2Init() {
    this.log('Initialized');
  }

  // Driver destroyed
  async onUninit() {
    this.log('Destroyed');
  }

  /*
  | Pairing functions
  */

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
        throw new Error(this.homey.__(`errors.${err.message}`) || err.message);
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
      this.log('Pair Session Disconnected');
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

    const devices = await this.getPairDevices({ oAuth2Client });

    if (blank(devices)) return [];

    return devices.map((device) => this.getDeviceData(device)).filter((e) => e);
  }

}

module.exports = Driver;
