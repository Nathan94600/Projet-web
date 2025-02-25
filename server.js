const { createServer } = require("http"), { readFile } = require("fs");

createServer((req, res) => {
	switch (req.method) {
		case "GET":
			switch (req.url) {
				case "/":
					readFile("./pages/index.html", (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": "text/html" }).write(data)
						res.end()
					})
					break;
				case "/connexion":
					readFile("./pages/connexion.html", (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": "text/html" }).write(data)
						res.end()
					})
					break;
				case "/inscription":
					readFile("./pages/inscription.html", (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": "text/html" }).write(data)
						res.end()
					})
					break;
				case "/produits":
					readFile("./pages/produits.html", (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": "text/html" }).write(data)
						res.end()
					})
					break;
				case "/style.css":
					readFile("./style.css", (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": "text/css" }).write(data)
						res.end()
					})
					break;
				default:
					if (req.url.startsWith("/images/")) readFile(`.${req.url}`, (err, data) => {
						if (err) throw err;
						
						res.writeHead(200, { "content-type": `image/${req.url.split(".").at(-1)}` }).write(data)
						res.end()
					})
					else res.writeHead(404, "Not found").end()
					break;
			}
			break;
		default:
			res.writeHead(404, "Not found").end()
			break;
	}
	}).listen(8080, () => console.log("http://localhost:8080")) 