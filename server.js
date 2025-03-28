const { createServer } = require("http"),
{ createTransport } = require("nodemailer"),
{ readFile } = require("fs"),
{ Database } = require("sqlite3"),
{ randomUUID, randomBytes, pbkdf2Sync } = require("crypto"),
{ gzip, brotliCompress, deflate } = require("zlib"),
{ email: senderEmail, password } = require("./config.json"),
componentRegexp = /(?<!\\)(?:\\\\)*\[[A-z]+\]/g,
variableRegexp = /(?<!\\)(?:\\\\)*{{[A-z]+}}/g,
emailRegexp = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
supportedEncodings = ["*", "br", "deflate", "gzip"],
db = new Database("database.db", err => {
	if (err) console.log("Erreur lors de la connexion à la base de données: ", err);
	else console.log("Connexion à la base de données réussie");
}),
colors = {
	Noir: 2**2,
	Jaune: 2**6,
	Rose: 2**7,
	Marron: 2**9,
	Orange: 2**5,
	Violet: 2**3,
	Gris: 2*10,
	Rouge: 2**0,
	Bleu: 2**1,
	Vert: 2**4,
	Blanc: 2**8
},
sexes = {
	Homme: "h",
	Femme: "f",
	Enfant: "e",
	Mixte: "m",
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
};

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

db.exec("CREATE TABLE IF NOT EXISTS products (id CHAR(36) NOT NULL PRIMARY KEY, supplierId VARCHAR(20) NOT NULL, name VARCHAR(50) NOT NULL, price INT NOT NULL, promoPrice INT, type CHAR(1) NOT NULL, colors INT NOT NULL, CHECK (type IN ('h', 'f', 'e', 'm')))", err => {
	if (err) console.log("Erreur lors de la création de la table products: ", err);
	else db.exec("CREATE TABLE IF NOT EXISTS stocks (id CHAR(36) NOT NULL PRIMARY KEY, productId CHAR(36) NOT NULL, quantity INT NOT NULL, size INT NOT NULL, FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE)", err => {
		if (err) console.log("Erreur lors de la création de la table stocks: ", err);
		else db.exec("CREATE TABLE IF NOT EXISTS users (id CHAR(36) NOT NULL PRIMARY KEY, email TEXT NOT NULL, username VARCHAR(20) NOT NULL, password CHAR(128) NOT NULL, password_salt CHAR(256) NOT NULL)", err => {
			if (err) console.log("Erreur lors de la création de la table users: ", err);
			else {
				createServer((req, res) => {
					const { pathname: url, searchParams } = new URL(req.url, "http://localhost:8080"),
					errorMessage = searchParams.get("error"),
					email = searchParams.get("email"),
					code = searchParams.get("code"),
					userToken = new URLSearchParams(req.headers.cookie || "").get("token");					

					switch (req.method) {
						case "GET":
							if (url.startsWith("/images/")) readFile(`.${url}`, (err, data) => {
								if (err) res.writeHead(404, "Not found").end();
								else res.writeHead(200, { "content-type": `image/${url.endsWith(".svg") ? "svg+xml" : url.split(".").at(-1)}` }).end(data);
							});
							else if (url.startsWith("/styles/")) readFile(`.${url}`, (err, data) => {
								if (err) res.writeHead(404, "Not found").end();
								else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { "content-type": `text/css`, "content-encoding": compression.encoding }).end(compression.data));
							});
							else if (url.startsWith("/scripts/")) readFile(`.${url}`, (err, data) => {
								if (err) res.writeHead(404, "Not found").end();
								else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { "content-type": `application/javascript`, "content-encoding": compression.encoding }).end(compression.data));
							});
							else if ((url == "/inscription" || url == "/connexion") && userToken) res.writeHead(302, { location: "/" }).end();
							else getPage(url, {
								error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
								email: email || "",
								code: code || "",
								accountText: userToken ? "Mon compte" : "Se connecter"
							}).then(
								data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
								() => res.writeHead(404, "Not found").end()
							);
							break;
						case "POST":
							if (url == "/connexion") {
								let body = "";

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
											console.log("Erreur lors de la vérication de l'email: ", err);

											res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
										} else if (!row) res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Aucun compte n'est associé à cet email")}` }).end();
										else if (row.password != securePassword(password, row.password_salt).password) res.writeHead(302, { location: `/connexion?error=${encodeURIComponent("Mot de passe incorrect")}` }).end();
										else res.writeHead(302, { location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${row.id};` }).end();
									});
								});
							} else if (url == "/inscription") {						
								let body = "";

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
												console.log("Erreur lors de la vérication de l'email: ", err);

												res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
											} else if (row) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Cet email est déjà utilisé")}` }).end();
											else db.exec(`INSERT INTO users (id, email, username, password, password_salt) VALUES (
												"${userId}",
												"${email}",
												"${username}",
												"${encryptedPassword}",
												"${passwordSalt}"
											)`, err => {
												if (err) {
													console.log("Erreur lors de la création du compte : ", err);

													res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la création du compte ")}` }).end();
												} else res.writeHead(302, { location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${userId};` }).end();
											});
										});
									};
								});
							} else if (url == "/password-reset/request") {
								let body = "";

								req.on("data", chunk => body += chunk).on("end", () => {
									const params = new URLSearchParams(body), mail = params.get("mail");

									let errorMessage = "";

									if (!mail) errorMessage = "Vous devez mettre un email";
									else if (!emailRegexp.test(mail)) errorMessage = "Vous devez mettre un email valide";									

									if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent(errorMessage)}` }).end();
									else {
										transporter.sendMail({
											from: senderEmail,
											to: mail,
											subject: "Code de réinitialisation de mot de passe",
											text: "Voici votre code de réinitialisation de mot de passe: " + (passwordResetCodes[mail] = randomBytes(4).toString("hex"))
										}, err => {
											if (err) res.writeHead(302, { location: `/mdp_oublie?error=${encodeURIComponent("Erreur lors de l'envoi du mail")}` }).end();
											else res.writeHead(302, { location: `/mdp_oublie?email=${mail}` }).end();
										});
									};
								});
							} else if (url == "/password-reset/verify") {
								let body = "";

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
							} else if (url == "/password-reset/confirm") {
								let body = "";

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

										db.exec(`UPDATE users SET password = "${pwd}", password_salt = "${passwordSalt}" WHERE email = "${email}"`, err => {											
											if (err) res.writeHead(302, { location: `/mdp_oublie_2?error=${encodeURIComponent("Erreur lors de la réinitialisation du mot de passe")}` }).end();
											else res.writeHead(302, { location: "/" }).end();
										});
									};
								});
							};
							break;
						default:
							res.writeHead(404, "Not found").end();
							break;
					};
				}).listen(8080, () => console.log("http://localhost:8080"));
			};
		}); 
	});
});