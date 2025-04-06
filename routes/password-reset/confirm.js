const { EMAIL_REGEX } = require("../../utils/constants");
const { securePassword } = require("../../utils/functions");

module.exports = (req, res, { passwordResetCodes, db }) => {
	if (req.method == "POST") {
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
				!EMAIL_REGEX.test(email) ||
				!code ||
				code != passwordResetCodes[email].code
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
					else res.writeHead(302, { location: "/", "set-cookie": "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;" }).end();
				});
			};
		});
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};