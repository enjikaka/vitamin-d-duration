async function getWeather([lon, lat]) {
  const url = new URL('https://api.met.no/weatherapi/locationforecast/2.0/.json');

  url.searchParams.append('lat', lat);
  url.searchParams.append('lon', lon);

  const response = await fetch(url.toString());
  const json = await response.json();

  const forecast = json.properties.timeseries.find(ts => ts.time.includes('T12:00:00Z')).data;

  return {
    altitude: json.geometry.coordinates[2],
    symbol: forecast.next_1_hours.summary.symbol_code
  };
}

function symbolToSkyCondition(imageUrl) {
  if (imageUrl.includes('clearsky')) {
    return 0; // Cloudless
  }

  if (imageUrl.includes('fair')) {
    return 1; // Scattered clouds
  }

  if (imageUrl.includes('partlycloudy')) {
    return 2; // Broken clouds
  }

  return 3; // Overcast
}

function getHourOffsetFromUTC() {
  const offset = new Date().toString().split('GMT')[1].split(' ')[0];

  return parseInt(offset.substr(1, 2), 10);
}

function decimalHourToHHMM (decimalHour) {
  const hh = parseInt(decimalHour, 10);
  const mm = Math.round((decimalHour % 1) * 60);

  const shh = hh < 10 ? '0' + hh : hh;
  const smm = mm < 10 ? '0' + mm : mm;

  return [shh, smm].join(':');
}

/**
 * @param {URL} url
 * @returns
 */
function validateSearchQuery (url) {
  const lat = parseFloat(url.searchParams.get('lat'));

  if (Number.isNaN(lat)) {
   throw new ReferenceError('You did not provide a latitude value in the "lat" search parameter.');
  }

  const lng = parseFloat(url.searchParams.get('lng'));

  if (Number.isNaN(lng)) {
    throw new ReferenceError('You did not provide a longitude value in the "lat" search parameter.');
  }

  const dateMs = parseFloat(url.searchParams.get('dateMs'));

  if (Number.isNaN(dateMs)) {
    throw new ReferenceError('You did not provide a value for the "dateMs" search parameter.');
  }

  return { lng, lat, dateMs };
}

async function handle (event) {
  const url = new URL(event.request.url);
  const { lng, lat, dateMs }  = validateSearchQuery(url);
  const date = new Date(dateMs);
  const { symbol, altitude } = await getWeather([lng, lat]);
  const skyCondition = symbolToSkyCondition(symbol);

  const monthMap = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const ozoneLayerThickness = 350;

  const formData = new URLSearchParams();

  formData.append('month', monthMap[date.getMonth()]);
  formData.append('mday', date.getUTCDate());
  formData.append('city', '8');
  formData.append('location_specification', '1');
  formData.append('latitude', lat);
  formData.append('longitude', lng);
  formData.append('sky_condition', skyCondition);
  formData.append('ozone_column', ozoneLayerThickness);
  formData.append('altitude', altitude / 1000);
  formData.append('type', '3');

  const response = await fetch('https://fastrt.nilu.no/cgi-bin/olaeng/VitD-ez.cgi', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  });

  const text = await response.text();

  let [startHour, stopHour, duration] = text.split('<BR>').pop().split('</body>')[0].trim().split(' ').map(parseFloat).filter(n => !Number.isNaN(n));

  const offset = getHourOffsetFromUTC();

  startHour += offset;
  stopHour += offset;

  startHour = decimalHourToHHMM(startHour);
  stopHour = decimalHourToHHMM(stopHour);

  const responseData = { startHour, stopHour, duration };

  const prettyPrint = event.request.headers.get('origin') === null;

  return new Response(JSON.stringify(responseData, null, prettyPrint ? 4 : undefined), {
    status: 200,
    headers: new Headers({
      'content-type': 'application/json'
    })
  });
}

function errorResponse (msg) {
  return new Response(msg, {
    status: 400,
  });
}

addEventListener('fetch', async event => {
  let response;

  try {
    response = await handle(event);
  } catch (e) {
    console.error(e);
    response = errorResponse(e.message);
  }

  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Request-Method', 'GET');

  event.respondWith(response);
});
