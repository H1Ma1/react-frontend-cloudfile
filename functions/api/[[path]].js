const BACKEND_URL =
  "https://fastapi-backend-cloudfile.onrender.com";


export async function onRequest(context) {
  try {
    const { request, params } = context;

    const incomingUrl =
      new URL(request.url);


    const pathParts =
      Array.isArray(params.path)
        ? params.path
        : params.path
          ? [params.path]
          : [];


    const backendPath =
      "/" + pathParts.join("/");


    const backendUrl =
      new URL(
        backendPath,
        BACKEND_URL
      );


    backendUrl.search =
      incomingUrl.search;


    const headers =
      new Headers(
        request.headers
      );


    headers.delete("host");


    const options = {
      method: request.method,
      headers,
      redirect: "manual",
    };


    if (
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      options.body =
        await request.arrayBuffer();
    }


    console.log(
      `${request.method} ${incomingUrl.pathname} -> ${backendUrl.toString()}`
    );


    const backendResponse =
      await fetch(
        backendUrl.toString(),
        options
      );


    console.log(
      `Backend response: ${backendResponse.status}`
    );


    // Возвращаем ответ Render напрямую.
    // Это также важно для Set-Cookie при login/refresh.
    return backendResponse;

  } catch (error) {
    console.error(
      "API proxy error:",
      error
    );


    // Очень важно:
    // теперь при ошибке мы увидим JSON 502,
    // а не React index.html.
    return Response.json(
      {
        detail:
          "Cloudflare API proxy error",

        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 502,
      }
    );
  }
}