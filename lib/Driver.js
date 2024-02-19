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

  onPair(socket) {
    const OAuth2ConfigId = this.getOAuth2ConfigId();

    let OAuth2SessionId = '$new';
    let currentViewId = 'list_sessions';
    let client = this.homey.app.createOAuth2Client({
      sessionId: OAuth2Util.getRandomId(),
      configId: OAuth2ConfigId,
    });

    const OAuth2Config = this.homey.app.getConfig({
      configId: OAuth2ConfigId,
    });

    const { allowMultiSession } = OAuth2Config;

    if (!allowMultiSession) {
      const savedSessions = this.homey.app.getSavedOAuth2Sessions();

      if (Object.keys(savedSessions).length) {
        OAuth2SessionId = Object.keys(savedSessions)[0];

        try {
          client = this.homey.app.getOAuth2Client({
            configId: OAuth2ConfigId,
            sessionId: OAuth2SessionId,
          });

          this.log(`Multi-Session disabled. Selected ${OAuth2SessionId} as active session.`);
        } catch (err) {
          this.error(err);
        }
      }
    }

    const onShowViewApiCredentials = () => {
      if (OAuth2SessionId !== '$new') {
        socket.nextView().catch(this.error);
      }
    };

    const onShowViewLoginCredentials = () => {
      if (OAuth2SessionId !== '$new') {
        socket.nextView().catch(this.error);
      }
    };

    const onLogin = async ({ username, password }) => {
      // Save client ID and secret
      if (currentViewId === 'api_credentials') {
        const clientId = username.trim();
        const clientSecret = password.trim();

        if (clientId.length < 10) {
          throw new Error(this.homey.__('errors.clientId'));
        }

        if (clientSecret.length < 10) {
          throw new Error(this.homey.__('errors.clientSecret'));
        }

        this.homey.settings.set(Homey.env.FLUME_CLIENT_ID_SETTING, clientId);
        this.homey.settings.set(Homey.env.FLUME_CLIENT_SECRET_SETTING, clientSecret);

        return socket.nextView().catch(this.error);
      }

      await client.getTokenByCredentials({ username, password });
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

    const onShowView = async (viewId) => {
      currentViewId = viewId;

      if (viewId === 'api_credentials') {
        onShowViewApiCredentials();
      } else if (viewId === 'login_credentials') {
        onShowViewLoginCredentials();
      }
    };

    const onListSessions = async () => {
      if (!allowMultiSession) {
        throw new Error('Multi-Session is disabled.\nPlease remove the list_devices from your App\'s manifest or allow Multi-Session support.');
      }

      const savedSessions = this.homey.app.getSavedOAuth2Sessions();

      const result = Object.keys(savedSessions).map((sessionId, i) => {
        const session = savedSessions[sessionId];
        return {
          name: session.title || `Saved User ${i + 1}`,
          data: { id: sessionId },
        };
      });

      result.push({
        name: 'New User',
        data: {
          id: '$new',
        },
      });

      return result;
    };

    const onListSessionsSelection = async ([selection]) => {
      if (!allowMultiSession) {
        throw new Error('Multi-Session is disabled.');
      }

      const { id } = selection.data;

      OAuth2SessionId = id;
      this.log(`Selected session ${OAuth2SessionId}`);

      if (OAuth2SessionId !== '$new') {
        client = this.homey.app.getOAuth2Client({
          configId: OAuth2ConfigId,
          sessionId: OAuth2SessionId,
        });
      }
    };

    const onListDevices = async (data) => {
      if (currentViewId === 'list_sessions') {
        return onListSessions(data);
      }

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

    socket
      .setHandler('showView', onShowView)
      .setHandler('login', onLogin)
      .setHandler('list_sessions', onListSessions)
      .setHandler('list_sessions_selection', onListSessionsSelection)
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
