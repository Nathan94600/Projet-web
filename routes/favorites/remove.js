module.exports = (req, res, { userToken, db }) => {
	if (req.method == "POST") {
		let body = "";
	
		req.on("data", chunk => body += chunk).on("end", () => {
			const params = new URLSearchParams(body),
			productId = params.get("productId"),
			location = params.get("location"),
			userId = userToken?.split(".")?.at(-1);										

			if (!productId || !location) res.writeHead(302, { location: "/panier" }).end();
			else if (userId) db.run(
				"DELETE FROM favorites WHERE userId = ? AND productId = ?;",
				[userId, productId],
				() => res.writeHead(302, { location }).end()
			);
			else res.writeHead(302, { location: "/panier" }).end();
		});
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};