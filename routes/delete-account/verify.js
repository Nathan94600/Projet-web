const { EMAIL_REGEX } = require("../../utils/constants");

module.exports = (req, res, { deleteAccountResetCodes, db }) => {
	if (req.method == "POST") {
		let body = "";
	
		req.on("data", chunk => body += chunk).on("end", () => {
			const params = new URLSearchParams(body), email = params.get("email"), code = params.get("code");

			let errorMessage = "";

			if (!email) errorMessage = "Vous devez mettre un email";
			else if (!EMAIL_REGEX.test(email)) errorMessage = "Vous devez mettre un email valide";
			else if (!code) errorMessage = "Vous devez mettre un code de suppression de compte";
			else if (code != deleteAccountResetCodes[email].code) errorMessage = "Le code de suppression de compte est incorrect";							

			if (errorMessage) res.writeHead(302, { location: `/delete_account?email=${email}&errorMessage=${encodeURIComponent(errorMessage)}` }).end();
			else db.run("DELETE FROM users WHERE email = ?", email, err => {											
				if (err) res.writeHead(302, {
					location: `/delete_account?email=${email}&errorMessage=${encodeURIComponent("Erreur lors de la suppression du compte")}`
				}).end();
				else res.writeHead(302, { location: "/", "set-cookie": "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;" }).end();
			});
		});
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};