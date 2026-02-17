import Parser from 'rss-parser';

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
	"Access-Control-Max-Age": "86400",
};

export default {
	async fetch(request, env, ctx) {
		if (request.method === "OPTIONS") {
			return handleOptions(request);
		}

		const cloudflareCache = caches.default;
		const cachedResponse = await cloudflareCache.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}

		const url = getSearchFromUrl(request.url, "url");
		if (!url) {
			return new Response(JSON.stringify({ error: "Missing 'url' parameter" }), {
				status: 400,
				headers: { "Content-Type": "application/json", ...corsHeaders }
			});
		}

		let xmlResponse;
		try {
			xmlResponse = await fetch(url);
			if (!xmlResponse.ok) {
				throw new Error(`Failed to fetch RSS: ${xmlResponse.statusText}`);
			}
		} catch (e) {
			return new Response(JSON.stringify({ error: e.message }), {
				status: 500,
				headers: { "Content-Type": "application/json", ...corsHeaders }
			});
		}

		const parser = new Parser({
			defaultRSS: 2.0,
			xml2js: {
				emptyTag: '--EMPTY--',
			},
			timeout: 4000,
			headers: { 'x-requested-with': '' },
			requestOptions: {
				rejectUnauthorized: false
			}
		});

		const xmlText = await xmlResponse.text();
		const feed = await parser.parseString(xmlText);
		const body = JSON.stringify({ feed });

		const response = new Response(body, {
			status: 200,
			headers: {
				...corsHeaders,
				"content-type": "application/json;charset=UTF-8"
			}
		});

		ctx.waitUntil(cloudflareCache.put(request, response.clone()));
		return response;
	},
};

function getSearchFromUrl(url, queryParam) {
	const possibleMatches = url.split("?")[1];
	if (!possibleMatches) return null;
	const queryParams = new URLSearchParams(possibleMatches);
	return queryParams.get(queryParam);
}

function handleOptions(request) {
	let headers = request.headers;
	if (
		headers.get("Origin") !== null &&
		headers.get("Access-Control-Request-Method") !== null &&
		headers.get("Access-Control-Request-Headers") !== null
	) {
		let respHeaders = {
			...corsHeaders,
			"Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers"),
		};
		return new Response(null, { headers: respHeaders });
	} else {
		return new Response(null, {
			headers: {
				Allow: "GET, HEAD, POST, OPTIONS",
			},
		});
	}
}
