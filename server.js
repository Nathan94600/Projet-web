// Importation des modules nécessaires
const { createServer } = require("http"),
	{ createTransport } = require("nodemailer"),
	{ Database } = require("sqlite3"),
	{ randomUUID } = require("crypto"),
	{ networkInterfaces } = require("os"),
	{ email: senderEmail, password } = require("./config.json"),
	products = require("./products.json"),
	stocks = require("./stocks.json"),
	{ handleGetRequest } = require("./utils/functions"),
	{ readdir, stat } = require("fs");

const routes = {
	// path: file
};


// Variables
const db = new Database("database.db", err => {
	if (err) console.error("Erreur lors de la connexion à la base de données: ", err);
	else console.log("Connexion à la base de données réussie");
}),
transporter = createTransport({
	service: "outlook",
	host: "smtp-mail.outlook.com",
	auth: {
		user: senderEmail,
		pass: password
	}
}),
passwordResetCodes = {
	// email: code
},
host = process.argv.includes("--ip") ?
	Object.entries(networkInterfaces()).filter(([name]) => !name.includes("VM")).map(interface => interface[1]).flat().filter(interface => typeof interface != "string" && !interface.internal && interface.family == "IPv4")[0].address || "localhost" :
	"localhost";

function setRoutes(path, defaultPath = null) {
	return new Promise((resolve, reject) => {
		let filesRead = 0;

		readdir(path, (err, files) => {
			if (err) reject(err);
			else if (files.length == 0) resolve();
			else files.forEach(file => {
				stat(`${path}/${file}`, (err, stats) => {
					if (err) reject(err);
					else if (stats.isDirectory()) setRoutes(`${path}/${file}`, defaultPath || path).then(res => {
						filesRead++;

						if (filesRead == files.length) resolve()
					}, reason => reject(reason));
					else {
						filesRead++;						

						routes[`${path}/${file.split(".")[0]}`.replace(defaultPath || path, "")] = require(`${path}/${file}`);

						if (filesRead == files.length) resolve();
					};
				});
			});
		});
	});
};

setRoutes("./routes").then(() => {
	db.serialize(() => {
		db.run("BEGIN TRANSACTION", err => {
			if (err) console.error("Erreur lors de la création de la transaction: ", err);
		});
	
		db.exec(`
			CREATE TABLE IF NOT EXISTS products (
				id CHAR(36) NOT NULL PRIMARY KEY,
				supplierId VARCHAR(20) NOT NULL,
				name VARCHAR(50) NOT NULL,
				price INT NOT NULL,
				soldCount INT DEFAULT 0,
				promoPrice INT,
				genre INT NOT NULL,
				colors INT NOT NULL,
				date INT NOT NULL,
				supplier INT NOT NULL
			);
	
			CREATE UNIQUE INDEX IF NOT EXISTS indexSupplierId ON products(supplierId);
	
			CREATE TABLE IF NOT EXISTS stocks (
				id CHAR(36) NOT NULL PRIMARY KEY,
				productId CHAR(36) NOT NULL,
				quantity INT NOT NULL,
				size INT NOT NULL,
				FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
			);
	
			CREATE UNIQUE INDEX IF NOT EXISTS indexProductSize ON stocks(productId, size);
	
			CREATE TABLE IF NOT EXISTS users (
				id CHAR(36) NOT NULL PRIMARY KEY,
				email TEXT NOT NULL,
				username VARCHAR(20) NOT NULL,
				password CHAR(128) NOT NULL,
				password_salt CHAR(256) NOT NULL
			);
	
			CREATE TABLE IF NOT EXISTS carts (
				id CHAR(36) NOT NULL PRIMARY KEY,
				userId CHAR(36) NOT NULL,
				productId CHAR(36) NOT NULL,
				size INT NOT NULL,
				FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
			);
	
			CREATE UNIQUE INDEX IF NOT EXISTS indexProductInCart ON carts(userId, productId, size);
	
			CREATE TABLE IF NOT EXISTS favorites (
				id CHAR(36) NOT NULL PRIMARY KEY,
				userId CHAR(36) NOT NULL,
				productId CHAR(36) NOT NULL,
				FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
				FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE
			);
	
			CREATE UNIQUE INDEX IF NOT EXISTS indexProductInFavorites ON favorites(userId, productId);
		`, err => {
			if (err) console.error("Erreur lors de la création des tables: ", err);
		});
	
		const reqForProducts = db.prepare(`
			INSERT OR IGNORE INTO products (
				id,
				supplierId,
				name,
				price,
				promoPrice,
				genre,
				colors,
				date,
				supplier,
				soldCount
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
		`);
	
		products.forEach(product => {
			reqForProducts.run(
				randomUUID({ disableEntropyCache: true }),
				product.supplierId,
				product.name,
				product.price,
				product.promoPrice || null,
				product.genre,
				product.colors,
				new Date(product.date).getTime(),
				product.supplier,
				product.soldCount,
				err => {
					if (err) console.error("Erreur lors de l'ajout du produit: ", err);
				}
			);
		});
	
		reqForProducts.finalize(err => {
			if (err) console.error("Erreur lors de la finalisation de la requête: ", err);
		});
	
		const reqForStocks = db.prepare("INSERT OR IGNORE INTO stocks (id, productId, quantity, size) VALUES (?, ?, ?, ?);");
	
		Promise.all(stocks.map(stock => new Promise((resolve, reject) => {
			db.get("SELECT id FROM products WHERE supplierId = ?;", stock.supplierId, (err, row) => {
				if (err) {
					console.error("Erreur lors de la récupération de l'id du produit: ", err);
					reject(err);
				} else if (!row) {
					console.error("Produit introuvable: ", stock.supplierId);
					reject(new Error("Produit introuvable"));
				} else Object.entries(stock.quantities).forEach(([size, quantity]) => reqForStocks.run(
					randomUUID({ disableEntropyCache: true }),
					row.id,
					quantity,
					size,
					err => {
						if (err) {
							console.error("Erreur lors de l'ajout du stock: ", err);
							reject(err);
						} else resolve();
					}
				));
			});
		}))).then(() => {
			reqForStocks.finalize(err => {
				if (err) console.error("Erreur lors de la finalisation de la requête: ", err);
				else db.run("COMMIT;", err => {
					if (err) console.error("Erreur lors de la validation de la transaction: ", err);
					else createServer((req, res) => {
						const { pathname: url, searchParams } = new URL(req.url, "http://localhost:8080"),
						cookies = Object.fromEntries(req.headers.cookie?.split(";").map(cookie => cookie.trim().split("=")) || []),
						userToken = cookies?.token;									
	
						switch (req.method) {
							case "GET":
								if (userToken) {
									const userId = userToken.split(".")?.at(-1);
									
									db.get("SELECT * FROM users WHERE id = ?;", userId, (err, row) => {
										if (err) {
											console.error("Erreur lors de la vérification du token: ", err);
	
											res.writeHead(500, "Internal Server Error").end();
										} else handleGetRequest(
											db,
											url,
											req,
											res,
											searchParams,
											cookies,
											!row ? { "set-cookie": "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;" } : {}
										);
									});
								} else handleGetRequest(db, url, req, res, searchParams, cookies);
								break;
							case "POST":								
								if (routes[url]) routes[url](req, res, {
									userToken,
									searchParams,
									cookies,
									passwordResetCodes,
									transporter,
									db
								});
								else res.writeHead(404, "Not found").end();
								break;
							default:
								res.writeHead(404, "Not found").end();
								break;
						};
					}).listen({ host, port: 8080 }, () => console.log(`http://${host}:8080`));
				});
			});
		});
	});
}, err => { throw err; });