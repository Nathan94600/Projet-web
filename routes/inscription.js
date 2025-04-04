const { securePassword } = require("../utils/functions");
const { EMAIL_REGEX } = require("../utils/constants");
const { randomUUID, randomBytes } = require("crypto");

module.exports = (req, res, { db }) => {
	if (req.method == "POST") {
		let body = "";
	
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
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};