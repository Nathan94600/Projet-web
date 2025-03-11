const { createServer } = require("http"), { readFile } = require("fs"), { Database } = require("sqlite3"), { randomUUID, randomBytes, pbkdf2Sync } = require("crypto"), db = new Database("database.db", err => {
	if (err) console.log("Erreur lors de la connexion à la base de données: ", err);
	else console.log("Connexion à la base de données réussie");
});

db.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT, username TEXT, password TEXT, password_salt TEXT)", err => {
	if (err) console.log("Erreur lors de la création de la table users: ", err);
	else {
		createServer((req, res) => {
			const { pathname: url, searchParams } = new URL(req.url, "http://localhost:8080"), errorMessage = searchParams.get("error"), userToken = new URLSearchParams(req.headers.cookie || "").get("token");
		
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
					else if ((url == "/inscription" || url == "/connexion") && userToken) res.writeHead(302, { location: "/" }).end();
					else readFile(`./pages${url == "/" ? "/index" : url}.html`, (err, data) => {
						if (err) res.writeHead(404, "Not found").end();
						else res.writeHead(200, { "content-type": `text/html` }).end(data.toString().replace("{{error}}", errorMessage ? `<p id="error">${errorMessage}</p>` : ""));
					});
					break;
				case "POST":
					if (url == "/connexion") {
						let body = "";
						req.on("data", chunk => body += chunk);
						req.on("end", () => {
							const params = new URLSearchParams(body),
							email = params.get("email"),
							password = params.get("password");
		
							console.log(email, password);
						});
					} else if (url == "/inscription") {						
						let body = "";

						req.on("data", chunk => body += chunk).on("end", () => {
							const params = new URLSearchParams(body), email = params.get("email"), username = params.get("username"), password = params.get("password"), password2 = params.get("password2");
		
							let errorMessage = "";
		
							if (!email) errorMessage = "Vous devez mettre un email";
							else if (!username) errorMessage = "Vous devez mettre un nom d'utilisateur";
							else if (username.length > 20 || username.length < 3) errorMessage = "Votre nom d'utilisateur doit contenir entre 3 et 20 caractères";
							else if (password.length > 20 || password.length < 8 || password2.length > 20 || password2.length < 8) errorMessage = "Votre mot de passe doit contenir entre 8 et 20 caractères";
							else if (password != password2) errorMessage = "Les mots de passe ne correspondent pas";
		
							if (errorMessage) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent(errorMessage)}` }).end();
							else {
								const passwordSalt = randomBytes(128).toString("hex"), userId = randomUUID({ disableEntropyCache: true });

								db.get("SELECT * FROM users WHERE email = ?", email, (err, row) => {
									if (err) {
										console.log("Erreur lors de la vérication de l'email: ", err);
	
										res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la vérification de l'email")}` }).end();
									} else if (row) res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Cet email est déjà utilisé")}` }).end();
									else db.exec(`INSERT INTO users (id, email, username, password, password_salt) VALUES (
										"${userId}",
										"${email}",
										"${username}",
										"${pbkdf2Sync(password, passwordSalt, 1e6, 64, "sha3-512").toString("hex")}",
										"${passwordSalt}"
									)`, err => {
										if (err) {
											console.log("Erreur lors de la création du compte : ", err);
	
											res.writeHead(302, { location: `/inscription?error=${encodeURIComponent("Erreur lors de la création du compte ")}` }).end();
										} else res.writeHead(302, { location: "/", "set-cookie": `token=${randomBytes(64).toString('hex')}.${userId}; ` }).end();
									});
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