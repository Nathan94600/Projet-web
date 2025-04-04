module.exports = (req, res, { userToken, cookies, db }) => {
	if (req.method == "POST") {
		let body = "";
	
		req.on("data", chunk => body += chunk).on("end", () => {
			const params = new URLSearchParams(body),
			[productId, size] = params.get("product")?.split("_"),
			userId = userToken?.split(".")?.at(-1);

			if (!size || !productId) res.writeHead(302, { location: "/panier" }).end();
			else if (userId) db.run("DELETE FROM carts WHERE userId = ? AND productId = ? AND size = ?;", [userId, productId, size], err => {
				if (err) console.error("Erreur lors de la suppression du produit du panier: ", err);												
					
				res.writeHead(302, { location: "/panier" }).end();
			})
			else {
				const cart = cookies.cart;

				if (!cart) res.writeHead(302, { location: "/panier" }).end();
				else {
					const productsInCart = cart.split("_");

					productsInCart.splice(productsInCart.indexOf(`${productId}*${size}`), 1);

					res.writeHead(302, { location: "/panier", "set-cookie": `cart=${productsInCart.join("_")}; Max-Age=2592000; Path=/;` }).end()
				};
			};
		});
	} else res.writeHead(405, { "Allow": "POST" }).end("Method not allowed.");
};