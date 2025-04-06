const { EMAIL_REGEX } = require("../../utils/constants");
const { randomBytes } = require("crypto");

module.exports = (req, res, { passwordResetCodes, transporter, db, senderEmail }) => {
	if (req.method == "POST") {
		let body = "";
	
		req.on("data", chunk => body += chunk).on("end", () => {
			const params = new URLSearchParams(body), mail = params.get("mail");

			let errorMessage = "", timeLeft = passwordResetCodes[mail] ? Date.now() - passwordResetCodes[mail].date : null;

			if (!mail) errorMessage = "Vous devez mettre un email";
			else if (!EMAIL_REGEX.test(mail)) errorMessage = "Vous devez mettre un email valide";
			else if (timeLeft && timeLeft < 10000) errorMessage = `Vous devez attendre ${Math.round(10 - timeLeft / 1000)} secondes avant de redemander un code de réinitialisation`;

			if (errorMessage) res.writeHead(302, { location: `/mdp_oublie?email=${mail}&errorMessage=${encodeURIComponent(errorMessage)}` }).end();
			else db.get("SELECT * FROM users WHERE email = ?", mail, (err, row) => {
				if (err) res.writeHead(302, {
					location: `/mdp_oublie?email=${mail}&errorMessage=${encodeURIComponent("Erreur lors de la vérification de l'email")}`
				}).end();
				else if (!row) res.writeHead(302, {
					location: `/mdp_oublie?email=${mail}&errorMessage=${encodeURIComponent("Aucun compte n'est associé à cet email")}`
				}).end();
				else {
					passwordResetCodes[mail] = { code: randomBytes(4).toString("hex"), date: Date.now() };
					transporter.sendMail({
						from: senderEmail,
						to: mail,
						subject: "Code de réinitialisation de mot de passe",
						text: "Voici votre code de réinitialisation de mot de passe: " + passwordResetCodes[mail].code
					}, err => {
						if (err) res.writeHead(302, {
							location: `/mdp_oublie?email=${mail}&errorMessage=${encodeURIComponent("Erreur lors de l'envoi du mail")}`
						}).end();
						else res.writeHead(302, { location: `/mdp_oublie?email=${mail}&successMessage=${encodeURIComponent("Code envoyé")}` }).end();
					});
				};
			});
		});
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};