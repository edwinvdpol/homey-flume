'use strict';

const Driver = require('../../lib/Driver');
const { blank } = require('../../lib/Utils');
const { DeviceType } = require('../../lib/Enums');

class SensorDriver extends Driver {

  /*
  | Pairing functions
  */

  // Return devices while pairing
  async getPairDevices({ oAuth2Client }) {
    return oAuth2Client.getDevices(DeviceType.sensor);
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

module.exports = SensorDriver;
