const { EMAIL_REGEX } = require("../../utils/constants");

module.exports = (req, res, { passwordResetCodes }) => {
	if (req.method == "POST") {
		let body = "";
	
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
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};