async function handle () {

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

    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Request-Method', 'GET');
  } catch (e) {
    response = errorResponse(e.message);
  }

  event.respondWith(response);
});
