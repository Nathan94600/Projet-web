// Importation des modules nécessaires
const { createServer, ServerResponse, IncomingMessage } = require("http"),
	{ createTransport } = require("nodemailer"),
	{ readFile, readdir } = require("fs"),
	{ Database } = require("sqlite3"),
	{ randomUUID, randomBytes, pbkdf2Sync } = require("crypto"),
	{ gzip, brotliCompress, deflate } = require("zlib"),
	{ networkInterfaces } = require("os"),
	{ email: senderEmail, password } = require("./config.json"),
	products = require("./products.json"),
	stocks = require("./stocks.json");

// Variables
const componentRegexp = /(?<!\\)(?:\\\\)*\[[A-z]+\]/g,
variableRegexp = /(?<!\\)(?:\\\\)*{{[A-z]+}}/g,
emailRegexp = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
supportedEncodings = ["*", "br", "deflate", "gzip"],
db = new Database("database.db", err => {
	if (err) console.error("Erreur lors de la connexion à la base de données: ", err);
	else console.log("Connexion à la base de données réussie");
}),
colors = {
	[2**0]: "rouge",
	[2**1]: "bleu",
	[2**2]: "noir",
	[2**3]: "violet",
	[2**4]: "vert",
	[2**5]: "orange",
	[2**6]: "jaune",
	[2**7]: "rose",
	[2**8]: "blanc",
	[2**9]: "marron",
	[2**10]: "gris",
},
suppliers = {
	[2**0]: "new-balance",
	[2**1]: "puma",
	[2**2]: "nike",
	[2**3]: "asics",
	[2**4]: "adidas",
},
sexes = {
	h: "homme",
	f: "femme",
	e: "enfant",
	m: "mixte",
},
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

/**
 * @param { string } password 
 * @param { string } passwordSalt 
 */
function securePassword(password, passwordSalt = randomBytes(128).toString("hex")) {	
	return { password: pbkdf2Sync(password, passwordSalt, 1e6, 64, "sha3-512").toString("hex"), passwordSalt };
}

/**
 * @param { string } acceptEncodingHeader 
 * @param { string } data
 * @returns { Promise<{ encoding: string; data: Buffer<ArrayBufferLike>; }> }
 */
function compressData(acceptEncodingHeader, data) {
	const encodings = acceptEncodingHeader.split(",").map(encoding => {
		const [name, qualityValue] = encoding.trim().split(";")				

		return { name, q: parseFloat(qualityValue?.split("=")?.[1] || "1") }
	}).filter(encoding => supportedEncodings.includes(encoding.name)),
	bestQValue = Math.max(...encodings.map(encoding => encoding.q)),
	bestEncodings = encodings.filter(encoding => encoding.q == bestQValue),
	bestEncoding = supportedEncodings.find(encoding => bestEncodings.some(({ name }) => name == encoding));

	return new Promise(resolve => {
		switch (bestEncoding == "*" ? supportedEncodings[1] : bestEncoding) {
			case "gzip":
				gzip(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "gzip", data: res });
				});
				break;
			case "deflate":
				deflate(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "deflate", data: res });
				});
				break;
			case "br":
				brotliCompress(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "br", data: res });
				});
				break;
			default:
				resolve({ encoding: "identity", data });
				break;
		};
	});
};

/**
 * @param { string } pageName 
 * @param { Record<string, string> } params
 */
function getPage(pageURL, params = {}) {
	return new Promise((resolve, reject) => {
		readFile(`./pages${pageURL == "/" ? "/index" : pageURL}.html`, (err, data) => {
			if (err) reject(err);
			else {
				let pageCode = data.toString(), components = pageCode.match(componentRegexp);

				if (components) components.forEach((value, index) => {					
					const componentName = value.replace(/[\\\[\]]/g, "");

					readFile(`./components/${componentName}.html`, (err, data) => {
            if (err) reject(err);
            else {
              pageCode = pageCode.replace(`[${componentName}]`, data.toString());
							
							pageCode.match(variableRegexp)?.forEach(variable => {
								const variableName = variable.replace(/[{}\\]/g, "");

								pageCode = pageCode.replace(`{{${variableName}}}`, params[variableName]);
							});							

							if (index + 1 == components.length) resolve(pageCode);
            };
          });
				});
				else {
					pageCode.match(variableRegexp)?.forEach(variable => {
						const variableName = variable.replace(/[{}\\]/g, "");

						pageCode = pageCode.replace(`{{${variableName}}}`, params[variableName]);
					});					

					resolve(pageCode);
				};
			};
		});
	});
};

function typeToText(type) {
	return `Chaussure ${type == "m" ? sexes[type] : `pour ${sexes[type]}`}`;
};

function generateProductItem(product, itemName) {
	const url = `/images/products/${product.supplierName}/${product.type.toUpperCase()}${product.supplierId}/00`;	
	
	return product.formattedPromoPrice ? `
		<a href="/produits/${product.id}" class="${itemName}-item container-link">
			<img src="${url}-1000w.webp" alt="" class="product-img" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w" sizes="20vw">
			<hr class="separator">
			<p class="promo">EN PROMOTION</p>
			<p class="name">${product.name}</p>
			<p class="type">${typeToText(product.type)}</p>
			<div class="prices">
				<p class="promo-price">${product.formattedPromoPrice}€</p>
				<p class="price">${product.formattedPrice}€</p>
			</div>
		</a>
	` : `
		<a href="/produits/${product.id}" class="${itemName}-item container-link">
			<img src="${url}-1000w.webp" alt="" class="product-img" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w" sizes="20vw">
			<hr class="separator">
			<p>${product.name}</p>
			<p class="type">${typeToText(product.type)}</p>
			<p class="price">${product.formattedPrice}€</p>
		</a>
	`;
};

/**
 * Gère les requêtes GET en fonction de l'URL.
 * @param { string } url - L'URL de la requête.
 * @param { IncomingMessage } req - La requête HTTP.
 * @param { ServerResponse } res - La réponse HTTP.
 * @param { URLSearchParams } params - Les paramètres de la requête.
 * @param { Record<string, string> } headers - Les en-têtes supplémentaires à ajouter à la réponse.
 */
function handleGetRequest(url, req, res, params, cookies, headers = {}) {	
	const userToken = cookies.token,
	errorMessage = params.get("errorMessage"),
	successMessage = params.get("successMessage");	

	if (url.startsWith("/images/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else if (url.endsWith(".svg")) compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": "image/svg+xml", "content-encoding": compression.encoding }).end(compression.data));
		else res.writeHead(200, { ...headers, "content-type": `image/${url.split(".").at(-1)}` }).end(data);
	});
	else if (url.startsWith("/styles/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/css`, "content-encoding": compression.encoding }).end(compression.data));
	});
	else if (url.startsWith("/scripts/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `application/javascript`, "content-encoding": compression.encoding }).end(compression.data));
	});
	else if ((url == "/inscription" || url == "/connexion") && userToken) res.writeHead(302, { location: "/" }).end();
	else if (url == "/produits") {
		const conditions = [],
		promoParams = params.get("promo"),
		genderParams = params.get("genre"),
		colorsParams = params.get("couleurs"),
		newProductsParams = params.get("new"),
		suppliersParams = params.get("marques");

		if (promoParams == "true") conditions.push("promoPrice IS NOT NULL");
		else if (promoParams == "false") conditions.push("promoPrice IS NULL");

		if (genderParams == "h") conditions.push("type = 'h' OR type = 'm'");
		else if (genderParams == "f") conditions.push("type = 'f' OR type = 'm'");
		else if (genderParams == "e") conditions.push("type = 'e'");
		else if (genderParams == "m") conditions.push("type = 'm'");

		const colorsCondition = Object.keys(colors).filter(color => (colorsParams & color) == color).map(color => `(colors & ${color}) = ${color}`).join(" OR ");

		if (colorsCondition) conditions.push(`(${colorsCondition})`);

		if (newProductsParams == "true") conditions.push(`date > ${Date.now() - 1209600000 /* 2 semaines */}`);
		else if (newProductsParams == "false") conditions.push(`date <= ${Date.now() - 1209600000 /* 2 semaines */}`);

		const suppliersCondition = Object.keys(suppliers).filter(supplier => (suppliersParams & supplier) == supplier).map(supplier => `supplierName = "${suppliers[supplier]}"`).join(" OR ");

		if (suppliersCondition) conditions.push(`(${suppliersCondition})`);		
		
		db.all(`SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products${conditions.length != 0 ? ` WHERE ${conditions.join(" AND ")}` : ""}`, (err, rows) => {
			if (err) {
				console.error("Erreur lors de la récupération des produits: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else db.all("SELECT DISTINCT size FROM stocks ORDER BY size ASC", (err, sizes) => {				
				if (err) {
					console.error("Erreur lors de la récupération des tailles: ", err);

					res.writeHead(500, "Internal Server Error").end();
				} else getPage(url, {
					products: rows.map(product => `
						<a href="/produits/${product.id}" class="product-card">
							<img src="/images/products/${product.supplierName}/${product.type.toUpperCase()}${product.supplierId}/01-300w.webp" alt="Running Shoes">
							<div class="product-info">
								<h3>${product.name}</h3>
								<p class="price">${typeToText(product.type)}</p>
								<p class="price">${product.formattedPrice}€</p>
								${product.formattedPromoPrice ? `<p class="promo-price">${product.formattedPromoPrice}€</p>` : ""}
							</div>
						</a>
					`).join(""),
					nbProducts: rows.length,
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					sizes: sizes.map(({ size }) => `
					  <div>
            	<input type="checkbox" name="size" value="${size}" id="${size}">
          	  <label class="size-label" for="${size}">${size}</label>
          	</div>
					`).join("")
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
			})
		});
	} else if (url == "/") db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products WHERE date > ?", Date.now() - 1209600000 /* 2 semaines */, (err, newProductsRows) => {
		if (err) {
			console.error("Erreur lors de la récupération des nouveaux produits: ", err);
			res.writeHead(500, "Internal Server Error").end();
		} else db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products ORDER BY soldCount DESC LIMIT 8", (err, bestProductsRows) => {
			if (err) {
				console.error("Erreur lors de la récupération des meilleurs produits: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products WHERE promoPrice IS NOT NULL LIMIT 8", (err, promoProductsRows) => {
				if (err) {
					console.error("Erreur lors de la récupération des produits en promo: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else getPage(url, {
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					newProducts: newProductsRows.map(product => generateProductItem(product, "news")).join(""),
					bestProducts: bestProductsRows.map(product => generateProductItem(product, "best-seller")).join(""),
					promoProducts: promoProductsRows.map(product => generateProductItem(product, "promo")).join(""),
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
			});
		});
	});
	else if (url == "/index" || url == "/produit") res.writeHead(404, "Not found").end()
	else if (url.startsWith("/produits/")) {
		const productId = url.split("/").at(-1);

		db.get(`
			SELECT
				name,
				promoPrice,
				supplierName,
				type,
				supplierId,
				CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
				CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice,
				GROUP_CONCAT(stocks.size || '-' || stocks.quantity, ' ') AS stocks
			FROM products JOIN stocks ON products.id = stocks.productId WHERE products.id = ? GROUP BY products.id
		`, productId, (err, product) => {
			if (err) {
				console.error("Erreur lors de la récupération du produit: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else if (!product) res.writeHead(404, "Not found").end();
			else readdir(`./images/products/${product.supplierName}/${product.type.toUpperCase()}${product.supplierId}`, (err, files) => {
				if (err) {
					console.error("Erreur lors de la récupéraction des images du produit: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else db.all("SELECT id, supplierId FROM products WHERE supplierName = ? AND type = ? AND name = ?", [product.supplierName, product.type, product.name], (err, rows) => {
					if (err) {
						console.error("Erreur lors de la récupéraction des produits liés : ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else {
						const firstImageURL = `/images/products/${product.supplierName}/${product.type.toUpperCase()}${product.supplierId}/01`;						
						
						getPage("/produit", {
							accountText: userToken ? "Mon compte" : "Se connecter",
							accountLink: userToken ? "/profil" : "/connexion",
							productPresentation: `
								<img src="${firstImageURL}.webp" alt="" id="display" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
								<hr>
								<div id="images-container">
									<img src="${firstImageURL}.webp" alt="" id="current-presentation" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
									${files.filter(file => !file.includes("-")).slice(2).map(file => {
										const url = `/images/products/${product.supplierName}/${product.type.toUpperCase()}${product.supplierId}/${file.split(".")[0]}`;

										return `<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w">`
									}).join("")}
								</div>
							`,
							productInfos: `
								<div id="text-container">
									<p id="name">${product.name}</p>
									${product.promoPrice ? '<p id="promo">EN PROMOTION</p>' : ""}
								</div>
								<p id="type">${typeToText(product.type)}</p>
								${product.promoPrice ? `
									<div id="prices">
										<p id="promo-price">${product.formattedPromoPrice}€</p>
										<p id="price">${product.formattedPrice}€</p>
									</div>
								` : `<p id="price">${product.formattedPrice}€</p>`}
							`,
							sizes: product.stocks.split(" ").map(stock => {
								const [size, quantity] = stock.split("-");
	
								return `
									<div>
										<input type="radio" id="${size}" value="${size}" name="size"${quantity == 0 ? " disabled" : ""}>
										<label for="${size}">${size}</label>
									</div>
								`;
							}).join("").replace('"size">', '"size" checked>'),
							linkedProducts: rows.map((row, i) => {
								const url = `/images/products/${product.supplierName}/${product.type.toUpperCase()}${row.supplierId}/00`;

								return `
									<a href="/produits/${row.id}" class="container-link ${rows.length - 1 == i ? "last" : ""}">
										<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w" alt="" ${row.supplierId == product.supplierId ? 'class="current-item"' : ""}>
									</a>
								`;
							}).join(""),
							productId: productId,
							error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
							success: successMessage ? `<p id="success">${successMessage}</p>` : ""
						}).then(
							data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
							() => res.writeHead(404, "Not found").end()
						);
					};
				});
			});
		});
	} else getPage(url, {
		error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
		email: params.get("email") || "",
		code: params.get("code") || "",
		accountText: userToken ? "Mon compte" : "Se connecter",
		accountLink: userToken ? "/profil" : "/connexion",
	}).then(
		data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
		() => res.writeHead(404, "Not found").end()
	);
}

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
			type CHAR(1) NOT NULL,
			colors INT NOT NULL,
			date INT NOT NULL,
			supplierName VARCHAR(20) NOT NULL,
			CHECK (type IN ('h', 'f', 'e', 'm')),
			CHECK (supplierName IN ('new-balance', 'puma', 'nike', 'asics', 'adidas'))
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
	`, err => {
		if (err) console.error("Erreur lors de la création des tables: ", err);
	});

	const reqForProducts = db.prepare("INSERT OR IGNORE INTO products (id, supplierId, name, price, promoPrice, type, colors, date, supplierName, soldCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");

	products.forEach(product => {
		reqForProducts.run(randomUUID({ disableEntropyCache: true }), product.supplierId, product.name, product.price, product.promoPrice || null, product.type, product.colors, new Date(product.date).getTime(), product.supplierName, product.soldCount, err => {
			if (err) console.error("Erreur lors de l'ajout du produit: ", err);
		});
	});

	reqForProducts.finalize(err => {
		if (err) console.error("Erreur lors de la finalisation de la requête: ", err);
	});

	const reqForStocks = db.prepare("INSERT OR IGNORE INTO stocks (id, productId, quantity, size) VALUES (?, ?, ?, ?)");

	Promise.all(stocks.map(stock => new Promise((resolve, reject) => {
		db.get("SELECT id FROM products WHERE supplierId = ?", stock.supplierId, (err, row) => {
			if (err) {
				console.error("Erreur lors de la récupération de l'id du produit: ", err);
				reject(err);
			} else if (!row) {
				console.error("Produit introuvable: ", stock.supplierId);
				reject(new Error("Produit introuvable"));
			} else Object.entries(stock.quantities).forEach(([size, quantity]) => reqForStocks.run(randomUUID({ disableEntropyCache: true }), row.id, quantity, size, err => {
				if (err) {
					console.error("Erreur lors de l'ajout du stock: ", err);
					reject(err);
				} else resolve();
			}));
		})
	}))).then(() => {
		reqForStocks.finalize(err => {
			if (err) console.error("Erreur lors de la finalisation de la requête: ", err);
			else db.run("COMMIT", err => {
				if (err) console.error("Erreur lors de la validation de la transaction: ", err);
				else createServer((req, res) => {
					const { pathname: url, searchParams } = new URL(req.url, "http://localhost:8080"), cookies = Object.fromEntries(req.headers.cookie?.split(";").map(cookie => cookie.trim().split("=")) || []), userToken = cookies?.token;									

					switch (req.method) {
						case "GET":
							if (userToken) {
								const userId = userToken.split(".")?.at(-1);
								
								db.get("SELECT * FROM users WHERE id = ?", userId, (err, row) => {
									if (err) {
										console.error("Erreur lors de la vérification du token: ", err);

										res.writeHead(500, "Internal Server Error").end();
									} else handleGetRequest(url, req, res, searchParams, cookies, !row ? { "set-cookie": "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;" } : {});
								});
							} else handleGetRequest(url, req, res, searchParams, cookies);
							break;
						case "POST":							
							let body = "";

							switch (url) {
								case "/cart/add":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), productId = params.get("id"), size = parseFloat(params.get("size")), userId = userToken?.split(".")?.at(-1);

										if (!size) res.writeHead(302, { location: `/produits/${productId}?errorMessage=${encodeURIComponent("Taille invalide")}` }).end();
										else if (userToken) db.run("INSERT INTO carts (id, userId, productId, size) VALUES (?, ?, ?, ?)", [randomUUID({ disableEntropyCache: true }), userId, productId, size], err => {
											if (err) res.writeHead(302, { location: `/produits/${productId}?errorMessage=${encodeURIComponent("Erreur lors de l'ajout du produit au panier' ")}` }).end();
											else res.writeHead(302, { location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}` }).end();
										});
										else {
											const products = cookies.cart;											

											if (products && products.includes(`${productId}.${size}`)) res.writeHead(302, { location: `/produits/${productId}?errorMessage=${encodeURIComponent("Cet article est déjà dans votre panier")}` }).end();
											else res.writeHead(302, { location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}`, "set-cookie": `cart=${products ? `${products}_` : ""}${productId}.${size}; Max-Age=2592000; Path=/;` }).end();
										};
									});
									break;
								case "/connexion":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), email = params.get("email"), password = params.get("password");

										let errorMessage = "";

										if (!email) errorMessage = "Vous devez mettre un email";
										else if (!emailRegexp.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (password.length > 20 || password.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";

										if (errorMessage) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent(errorMessage)}` }).end();
										else db.get("SELECT * FROM users WHERE email = ?", email, (err, row) => {								
											if (err) {
												console.error("Erreur lors de la vérication de l'email: ", err);

												res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
											} else if (!row) res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Aucun compte n'est associé à cet email")}` }).end();
											else if (row.password != securePassword(password, row.password_salt).password) res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Mot de passe incorrect")}` }).end();
											else res.writeHead(302, { location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${row.id}; Path=/;` }).end();
										});
									});
									break;
								case "/inscription":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), email = params.get("email"), username = params.get("username"), password = params.get("password"), password2 = params.get("password2");

										let errorMessage = "";

										if (!email) errorMessage = "Vous devez mettre un email";
										else if (!emailRegexp.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!username) errorMessage = "Vous devez mettre un nom d'utilisateur";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (!password2) errorMessage = "Vous devez confirmer votre mot de passe";
										else if (username.length > 20 || username.length < 3) errorMessage = "Votre nom d'utilisateur doit contenir entre 3 et 20 caractères";
										else if (password.length > 20 || password.length < 8 || password2.length > 20 || password2.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";
										else if (password != password2) errorMessage = "Les mots de passe ne correspondent pas";

										if (errorMessage) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent(errorMessage)}` }).end();
										else {
											const { password: encryptedPassword, passwordSalt } = securePassword(password), userId = randomUUID({ disableEntropyCache: true });

											db.get("SELECT * FROM users WHERE email = ?", email, (err, row) => {
												if (err) {
													console.error("Erreur lors de la vérication de l'email: ", err);

													res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
												} else if (row) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Cet email est déjà utilisé")}` }).end();
												else db.run(`INSERT INTO users (id, email, username, password, password_salt) VALUES (?, ?, ?, ?, ?)`, [userId, email, username, encryptedPassword, passwordSalt], err => {
													if (err) {
														console.error("Erreur lors de la création du compte : ", err);

														res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la création du compte ")}` }).end();
													} else res.writeHead(302, { location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${userId}; Path=/;` }).end();
												});
											});
										};
									});
									break;
								case "/password-reset/request":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), mail = params.get("mail");

										let errorMessage = "";

										if (!mail) errorMessage = "Vous devez mettre un email";
										else if (!emailRegexp.test(mail)) errorMessage = "Vous devez mettre un email valide";

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent(errorMessage)}` }).end();
										else db.get("SELECT * FROM users WHERE email = ?", mail, (err, row) => {
											if (err) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
											else if (!row) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent("Aucun compte n'est associé à cet email")}` }).end();
											else transporter.sendMail({
												from: senderEmail,
												to: mail,
												subject: "Code de réinitialisation de mot de passe",
												text: "Voici votre code de réinitialisation de mot de passe: " + (passwordResetCodes[mail] = randomBytes(4).toString("hex"))
											}, err => {
												if (err) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent("Erreur lors de l'envoi du mail")}` }).end();
												else res.writeHead(302, { location: `/mdp_oublie?email=${mail}` }).end();
											});
										});
									});
									break;
								case "/password-reset/verify":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), email = params.get("email"), code = params.get("code");

										let errorMessage = "";

										if (!email) errorMessage = "Vous devez mettre un email";
										else if (!emailRegexp.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!code) errorMessage = "Vous devez mettre un code de réinitialisation";
										else if (code != passwordResetCodes[email]) errorMessage = "Le code de réinitialisation est incorrect";							

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent(errorMessage)}` }).end();
										else res.writeHead(302, { location: `/mdp_oublie_2?email=${email}&code=${code}` }).end();
									});
									break;
								case "/password-reset/confirm":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body),
										email = params.get("email"),
										code = params.get("code"),
										password = params.get("mot_de_passe"),
										password2 = params.get("mot_de_passe_verif");

										let errorMessage = "";									
		
										if (
											!email ||
											!emailRegexp.test(email) ||
											!code ||
											code != passwordResetCodes[email]
										) errorMessage = "Problème lors de la réinitialisation du mot de passe";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (!password2) errorMessage = "Vous devez confirmer votre mot de passe";
										else if (password.length > 20 || password.length < 8 || password2.length > 20 || password2.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";
										else if (password != password2) errorMessage = "Les mots de passe ne correspondent pas";				

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent(errorMessage)}` }).end();
										else {
											const { password: pwd, passwordSalt } = securePassword(password);

											db.run(`UPDATE users SET password = ?, password_salt = ? WHERE email = ?`, [pwd, passwordSalt, email], err => {											
												if (err) res.writeHead(302, { location: `/mdp_oublie_2?error=${encodeURIComponent("Erreur lors de la réinitialisation du mot de passe")}` }).end();
												else res.writeHead(302, { location: "/" }).end();
											});
										};
									});
									break;
								default:
									res.writeHead(404, "Not found").end();
									break;
							};
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