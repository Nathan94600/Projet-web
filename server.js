const { createServer } = require("http"), { readFile } = require("fs");

createServer((req, res) => {
	const { pathname: url } = new URL(req.url, "http://localhost:8080");

	switch (req.method) {
		case "GET":
			if (url.startsWith("/images/")) readFile(`.${url}`, (err, data) => {
				if (err) res.writeHead(404, "Not found").end();
				else res.writeHead(200, { "content-type": `image/${url.split(".").at(-1)}` }).end(data);
			});
			else if (url.startsWith("/styles/")) readFile(`.${url}`, (err, data) => {
				if (err) res.writeHead(404, "Not found").end();
				else res.writeHead(200, { "content-type": `text/css` }).end(data);
			});
			else readFile(`./pages${url == "/" ? "/index" : url}.html`, (err, data) => {
				if (err) res.writeHead(404, "Not found").end();
				else res.writeHead(200, { "content-type": `text/html` }).end(data);
			});
			break;
		default:
			res.writeHead(404, "Not found").end();
			break;
	};
}).listen(8080, () => console.log("http://localhost:8080"));