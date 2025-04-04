const { securePassword } = require("../utils/functions");
const { EMAIL_REGEX } = require("../utils/constants");
const { randomBytes } = require("crypto");

module.exports = (req, res, { db }) => {
	if (req.method == "POST") {
		let body = "";
	
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
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};