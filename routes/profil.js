const { EMAIL_REGEX } = require("../utils/constants");

module.exports = (req, res, { userToken, db }) => {
	if (req.method == "POST") {
		let body = "";

		req.on("data", (chunk) => (body += chunk)).on("end", () => {
      const params = new URLSearchParams(body),
      email = params.get("email"),
      username = params.get("username"),
      userId = userToken?.split(".")?.at(-1);

			if (!userId) res.writeHead(302, { location: "/inscription" }).end();
			else {
				let errorMessage = "";

				if (!email) errorMessage = "Vous devez mettre un email";
				else if (!EMAIL_REGEX.test(email)) errorMessage = "Vous devez mettre un email valide";
				else if (!username) errorMessage = "Vous devez mettre un nom d'utilisateur";
				else if (username.length > 20 || username.length < 3) errorMessage = "Votre nom d'utilisateur doit contenir entre 3 et 20 caractères";

				if (errorMessage) res.writeHead(302, { location: `/profil?errorMessage=${encodeURIComponent(errorMessage)}` }).end();
				else db.run("UPDATE users SET email = ?, username = ? WHERE id = ?", [email, username, userId], err => {
					if (err) res.writeHead(302, { location: `/profil?errorMessage=${encodeURIComponent(err.message)}` }).end();
					else res.writeHead(302, { location: `/profil?successMessage=${encodeURIComponent("Informations du profil modifié")}` }).end();
				});
			};
    });
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};