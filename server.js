// Importation des modules nécessaires
const { createServer } = require("http"),
	{ createTransport } = require("nodemailer"),
	{ Database } = require("sqlite3"),
	{ randomUUID, randomBytes } = require("crypto"),
	{ networkInterfaces } = require("os"),
	{ email: senderEmail, password } = require("./config.json"),
	products = require("./products.json"),
	stocks = require("./stocks.json"),
	{ securePassword, handleGetRequest } = require("./utils/functions");
const { EMAIL_REGEX } = require("./utils/constants");

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
							let body = "";

							switch (url) {
								case "/favorites/remove":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), productId = params.get("productId"), location = params.get("location"), userId = userToken?.split(".")?.at(-1);										

										if (!productId || !location) res.writeHead(302, { location: "/panier" }).end();
										else if (userId) db.run(
											"DELETE FROM favorites WHERE userId = ? AND productId = ?;",
											[userId, productId],
											() => res.writeHead(302, { location }).end()
										);
										else res.writeHead(302, { location: "/panier" }).end();
									});
									break;
								case "/favorites/add":
									req.on("data", chunk => body += chunk).on("end", () => {										
										const params = new URLSearchParams(body), productId = params.get("productId"), location = params.get("location"), userId = userToken?.split(".")?.at(-1);

										if (!productId || !location) res.writeHead(302, { location: "/panier" }).end();
										else if (userId) db.run(
											"INSERT INTO favorites (id, userId, productId) VALUES (?, ?, ?)",
											[randomUUID({ disableEntropyCache: true }), userId, productId],
											() => res.writeHead(302, { location }).end()
										);
										else res.writeHead(302, { location: "/panier" }).end();
									});
									break;
								case "/cart/remove":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), [productId, size] = params.get("product")?.split("_"), userId = userToken?.split(".")?.at(-1);

										if (!size || !productId) res.writeHead(302, { location: "/panier" }).end();
										else if (userId) db.run("DELETE FROM carts WHERE userId = ? AND productId = ? AND size = ?;", [userId, productId, size], err => {
											if (err) console.error("Erreur lors de la suppression du produit du panier: ", err);												
												
											res.writeHead(302, { location: "/panier" }).end();
										})
										else {
											const cart = cookies.cart;

											if (!cart) res.writeHead(302, { location: "/panier" }).end();
											else {
												const productsInCart = cart.split("_");

												productsInCart.splice(productsInCart.indexOf(`${productId}*${size}`), 1);

												res.writeHead(302, { location: "/panier", "set-cookie": `cart=${productsInCart.join("_")}; Max-Age=2592000; Path=/;` }).end()
											};
										};
									});
									break;
								case "/cart/add":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body),
										productId = params.get("id"),
										size = parseFloat(params.get("size")),
										userId = userToken?.split(".")?.at(-1);

										if (!size) res.writeHead(302, {
											location: `/produits/${productId}?errorMessage=${encodeURIComponent("Taille invalide")}`
										}).end();
										else if (userToken) db.run(
											"INSERT INTO carts (id, userId, productId, size) VALUES (?, ?, ?, ?)",
											[randomUUID({ disableEntropyCache: true }), userId, productId, size],
											err => {
												if (err) res.writeHead(302, {
													location: `/produits/${productId}?errorMessage=${encodeURIComponent("Erreur lors de l'ajout du produit au panier")}`
												}).end();
												else res.writeHead(302, {
													location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}`
												}).end();
											}
										);
										else {
											const products = cookies.cart;											

											if (products && products.includes(`${productId}*${size}`)) res.writeHead(302, {
												location: `/produits/${productId}?errorMessage=${encodeURIComponent("Cet article est déjà dans votre panier")}`
											}).end();
											else res.writeHead(302, {
												location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}`,
												"set-cookie": `cart=${products ? `${products}_` : ""}${productId}*${size}; Max-Age=2592000; Path=/;`
											}).end();
										};
									});
									break;
								case "/connexion":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), email = params.get("email"), password = params.get("password");

										let errorMessage = "";

										if (!email) errorMessage = "Vous devez mettre un email";
										else if (!EMAIL_REGEX.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (password.length > 20 || password.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";

										if (errorMessage) res.writeHead(302, { location: `/inscription?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
										else db.get("SELECT * FROM users WHERE email = ?", email, (err, row) => {								
											if (err) {
												console.error("Erreur lors de la vérication de l'email: ", err);

												res.writeHead(302, {
													location: `/connexion?errorMessage=${encodeURIComponent("Erreur lors de la vérification de l'email")}`
												}).end();
											} else if (!row) res.writeHead(302, {
												location: `/connexion?errorMessage=${encodeURIComponent("Aucun compte n'est associé à cet email")}`
											}).end();
											else if (row.password != securePassword(password, row.password_salt).password) res.writeHead(302, {
												location: `/connexion?errorMessage=${encodeURIComponent("Mot de passe incorrect")}`
											}).end();
											else res.writeHead(302, {
												location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${row.id}; Path=/;`
											}).end();
										});
									});
									break;
								case "/inscription":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body),
										email = params.get("email"),
										username = params.get("username"),
										password = params.get("password"),
										password2 = params.get("password2");

										let errorMessage = "";

										if (!email) errorMessage = "Vous devez mettre un email";
										else if (!EMAIL_REGEX.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!username) errorMessage = "Vous devez mettre un nom d'utilisateur";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (!password2) errorMessage = "Vous devez confirmer votre mot de passe";
										else if (username.length > 20 || username.length < 3) errorMessage = "Votre nom d'utilisateur doit contenir entre 3 et 20 caractères";
										else if (password.length > 20 || password.length < 8 || password2.length > 20 || password2.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";
										else if (password != password2) errorMessage = "Les mots de passe ne correspondent pas";

										if (errorMessage) res.writeHead(302, { location: `/inscription?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
										else {
											const { password: encryptedPassword, passwordSalt } = securePassword(password),
											userId = randomUUID({ disableEntropyCache: true });

											db.get("SELECT * FROM users WHERE email = ?", email, (err, row) => {
												if (err) {
													console.error("Erreur lors de la vérication de l'email: ", err);

													res.writeHead(302, {
														location: `/inscription?errorMessage=${encodeURIComponent("Erreur lors de la vérification de l'email")}`
													}).end();
												} else if (row) res.writeHead(302, {
													location: `/inscription?errorMessage=${encodeURIComponent("Cet email est déjà utilisé")}`
												}).end();
												else db.run(
													"INSERT INTO users (id, email, username, password, password_salt) VALUES (?, ?, ?, ?, ?)",
													[userId, email, username, encryptedPassword, passwordSalt],
													err => {
														if (err) {
															console.error("Erreur lors de la création du compte : ", err);

															res.writeHead(302, {
																location: `/inscription?errorMessage=${encodeURIComponent("Erreur lors de la création du compte ")}`
															}).end();
														} else res.writeHead(302, {
															location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${userId}; Path=/;`
														}).end();
													}
												);
											});
										};
									});
									break;
								case "/password-reset/request":
									req.on("data", chunk => body += chunk).on("end", () => {
										const params = new URLSearchParams(body), mail = params.get("mail");

										let errorMessage = "";

										if (!mail) errorMessage = "Vous devez mettre un email";
										else if (!EMAIL_REGEX.test(mail)) errorMessage = "Vous devez mettre un email valide";

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
										else db.get("SELECT * FROM users WHERE email = ?", mail, (err, row) => {
											if (err) res.writeHead(302, {
												location: `/mdp_oublie?errorMessage=${encodeURIComponent("Erreur lors de la vérification de l'email")}`
											}).end();
											else if (!row) res.writeHead(302, {
												location: `/mdp_oublie?errorMessage=${encodeURIComponent("Aucun compte n'est associé à cet email")}`
											}).end();
											else transporter.sendMail({
												from: senderEmail,
												to: mail,
												subject: "Code de réinitialisation de mot de passe",
												text: "Voici votre code de réinitialisation de mot de passe: " + (passwordResetCodes[mail] = randomBytes(4).toString("hex"))
											}, err => {
												if (err) res.writeHead(302, {
													location: `/mdp_oublie?errorMessage=${encodeURIComponent("Erreur lors de l'envoi du mail")}`
												}).end();
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
										else if (!EMAIL_REGEX.test(email)) errorMessage = "Vous devez mettre un email valide";
										else if (!code) errorMessage = "Vous devez mettre un code de réinitialisation";
										else if (code != passwordResetCodes[email]) errorMessage = "Le code de réinitialisation est incorrect";							

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
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
											!EMAIL_REGEX.test(email) ||
											!code ||
											code != passwordResetCodes[email]
										) errorMessage = "Problème lors de la réinitialisation du mot de passe";
										else if (!password) errorMessage = "Vous devez mettre un mot de passe";
										else if (!password2) errorMessage = "Vous devez confirmer votre mot de passe";
										else if (password.length > 20 || password.length < 8 || password2.length > 20 || password2.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";
										else if (password != password2) errorMessage = "Les mots de passe ne correspondent pas";				

										if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
										else {
											const { password: pwd, passwordSalt } = securePassword(password);

											db.run(`UPDATE users SET password = ?, password_salt = ? WHERE email = ?`, [pwd, passwordSalt, email], err => {											
												if (err) res.writeHead(302, {
													location: `/mdp_oublie_2?errorMessage=${encodeURIComponent("Erreur lors de la réinitialisation du mot de passe")}`
												}).end();
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