const { randomUUID } = require("crypto");

module.exports = (req, res, { userToken, cookies, db }) => {
  if (req.method == "POST") {
    let body = "";

    req.on("data", chunk => body += chunk).on("end", () => {
      const params = new URLSearchParams(body),
      productId = params.get("id"),
      size = parseFloat(params.get("size")),
      userId = userToken?.split(".")?.at(-1);

      if (!size) res.writeHead(302, { location: `/produits/${productId}?errorMessage=${encodeURIComponent("Taille invalide")}`}).end();
      else if (userToken) db.run(
				"INSERT INTO carts (id, userId, productId, size) VALUES (?, ?, ?, ?)",
        [randomUUID({ disableEntropyCache: true }), userId, productId, size],
        err => {
          if (err) res.writeHead(302, {
						location: `/produits/${productId}?errorMessage=${encodeURIComponent("Erreur lors de l'ajout du produit au panier")}`
					}).end();
          else res.writeHead(302, {
            location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}`
					}).end();
        }
			);
      else {
        const products = cookies.cart;

        if (products && products.includes(`${productId}*${size}`)) res.writeHead(302, {
          location: `/produits/${productId}?errorMessage=${encodeURIComponent("Cet article est déjà dans votre panier")}`,
        }).end();
        else res.writeHead(302, {
          location: `/produits/${productId}?successMessage=${encodeURIComponent("Article ajouté au panier")}`,
					"set-cookie": `cart=${products ? `${products}_` : ""}${productId}*${size}; Max-Age=2592000; Path=/;`,
        }).end();
      };
    });
  } else res.writeHead(405, { Allow: "POST" }).end("Method not allowed.");
};
