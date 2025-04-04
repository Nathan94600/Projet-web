const { EMAIL_REGEX } = require("../../utils/constants");
const { randomBytes } = require("crypto");

module.exports = (req, res, { passwordResetCodes, transporter, db }) => {
	if (req.method == "POST") {
		let body = "";
	
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
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};