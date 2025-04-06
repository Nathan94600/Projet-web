const { randomBytes, pbkdf2Sync } = require("crypto"),
	{ readFile, readdir } = require("fs"),
	{ gzip, brotliCompress, deflate } = require("zlib"),
	{ ServerResponse, IncomingMessage } = require("http"),
	{ SUPPLIER_NAMES, GENDER_NAMES, COMPONENT_REGEX, VARIABLE_REGEX, PROMO_VALUES, NEW_VALUES, COLORS, SUPPORTED_ENCODINGS } = require("./constants");

/**
 * @param { string } password 
 * @param { string } passwordSalt 
 */
function securePassword(password, passwordSalt = randomBytes(128).toString("hex")) {	
	return { password: pbkdf2Sync(password, passwordSalt, 1e6, 64, "sha3-512").toString("hex"), passwordSalt };
};

function buildImagePath(product, fileName) {	
	return `/images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${product.supplierId}/${fileName}`
};

function generateProductItemInCart(product, userConnected, favoriteProduct) {
	return product.quantity != 0 ? `
		<div id="article_ajouté">
			<a href="/produits/${product.id}">
				<img src="${buildImagePath(product, "01.webp")}" alt="airforce1" style="height: 5cm;"> 
			</a>
			<div id="description">
				<div id="nom_prix">
					<p class="product-name">${product.name}</p>
					${product.formattedPromoPrice ? `<p class="promo-price">${product.formattedPromoPrice}€</p>` : ""}
					<p class="price">${product.formattedPrice}€</p>
				</div>
				<p style="color: gray;">${typeToText(product.genre)}</p>
				<p style="color: gray;">Taille / Pointure : <u>${product.size}</u></p>
				<div id="like-poubelle" style="display: flex;">
					${userConnected ? `
						<form method="post" action="/favorites/${favoriteProduct ? "remove" : "add"}" class="favoris-form">
							<button type="submit" class="favoris-btn">
								<svg height="28" version="1.0" viewBox="0 0 24 24" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M16.4,4C14.6,4,13,4.9,12,6.3C11,4.9,9.4,4,7.6,4C4.5,4,2,6.5,2,9.6C2,14,12,22,12,22s10-8,10-12.4C22,6.5,19.5,4,16.4,4z"></path></svg>
							</button>
							<label style="color:gray;" for="product">${favoriteProduct ? "Retirer des favoris" : "Ajouter aux favoris"}</label>
							<input type="text" name="location" value="/panier" style="display: none;">
							<input type="text" name="productId" value="${product.id}" style="display: none;">
						</form>
					` : ""}
					<form method="post" action="/cart/remove" class="remove-form">
						<button type="submit" class="poubelle-btn">
							<img src="/images/assets/poubelle.png" height="28" alt="">
						</button>
						<label style="color:gray;" for="product">Retirer l'article</label>
						<input type="text" name="product" value="${product.id}_${product.size}" style="display: none;">
					</form>
				</div>
			</div>
		</div>
	` : `PLUS DISPO`;
};

function typeToText(type) {
	return `Chaussure ${type == "m" ? GENDER_NAMES[type] : `pour ${GENDER_NAMES[type]}`}`;
};

function generateProductItem(product, itemName) {
	const url = buildImagePath(product, "00");	
	
	return `
		<a href="/produits/${product.id}" class="${itemName}-item container-link">
			<img src="${url}-1000w.webp" alt="" class="product-img" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w" sizes="20vw">
			<hr class="separator">
			${product.formattedPromoPrice ? '<p class="promo">EN PROMOTION</p>' : ""}
			<p class="name">${product.name}</p>
			<p class="type">${typeToText(product.genre)}</p>
			${product.formattedPromoPrice ?
				`
					<div class="prices">
						<p class="promo-price">${product.formattedPromoPrice}€</p>
						<p class="price">${product.formattedPrice}€</p>
					</div>` :
				`<p class="price">${product.formattedPrice}€</p>`
			}
		</a>
	`;
};

/**
 * @param { string } pageName 
 * @param { Record<string, string> } params
 */
function getPage(pageURL, params = {}) {
	return new Promise((resolve, reject) => {
		readFile(`./pages${pageURL == "/" ? "/index" : pageURL}.html`, (err, data) => {
			if (err) reject(err);
			else {
				let pageCode = data.toString(), components = pageCode.match(COMPONENT_REGEX), componentsLoaded = 0;				

				if (components) components.forEach(value => {
					const componentName = value.replace(/[\\\[\]]/g, "");					

					readFile(`./components/${componentName}.html`, (err, data) => {
						if (err) reject(err);
						else {
							pageCode = pageCode.replace(`[${componentName}]`, data.toString());
							
							pageCode.match(VARIABLE_REGEX)?.forEach(variable => {
								const variableName = variable.replace(/[{}\\]/g, "");

								pageCode = pageCode.replace(`{{${variableName}}}`, params[variableName]);
							});
							
							componentsLoaded++;

							if (componentsLoaded == components.length) resolve(pageCode);							
						};
					});
				});
				else {
					pageCode.match(VARIABLE_REGEX)?.forEach(variable => {
						const variableName = variable.replace(/[{}\\]/g, "");

						pageCode = pageCode.replace(`{{${variableName}}}`, params[variableName]);
					});					

					resolve(pageCode);
				};
			};
		});
	});
};

/**
 * Gère les requêtes GET en fonction de l'URL.
 * @param { string } url - L'URL de la requête.
 * @param { IncomingMessage } req - La requête HTTP.
 * @param { ServerResponse } res - La réponse HTTP.
 * @param { URLSearchParams } params - Les paramètres de la requête.
 * @param { Record<string, string> } headers - Les en-têtes supplémentaires à ajouter à la réponse.
 */
function handleGetRequest(db, url, req, res, params, cookies, headers = {}) {	
	const userToken = cookies.token, errorMessage = params.get("errorMessage"), successMessage = params.get("successMessage");	

	if (url.startsWith("/images/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else if (url.endsWith(".svg")) compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": "image/svg+xml", "content-encoding": compression.encoding }).end(compression.data));
		else res.writeHead(200, { ...headers, "content-type": `image/${url.split(".").at(-1)}` }).end(data);
	});
	else if (url.startsWith("/styles/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/css`, "content-encoding": compression.encoding }).end(compression.data));
	});
	else if (url.startsWith("/scripts/")) readFile(`.${url}`, (err, data) => {
		if (err) res.writeHead(404, "Not found").end();
		else compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `application/javascript`, "content-encoding": compression.encoding }).end(compression.data));
	});
	else if (url == "/logout") res.writeHead(302, { location: "/", "set-cookie": "token=; Path=/;" }).end();
	else if ((url == "/inscription" || url == "/connexion") && userToken) res.writeHead(302, { location: "/" }).end();
	else if (url == "/profil" && !userToken) res.writeHead(302, { location: "/connexion" }).end();
	else if (url == "/produits") {
		let conditions = [];

		const genders = params.get("genres"),
		suppliers = params.get("marques"),
		promos = params.get("promos"),
		news = params.get("news"),
		pricesParams = params.get("prices"),
		sizesParams = params.get("sizes"),
		colorsParams = params.get("couleurs"),
		searchParams = params.get("search"),
		sortOption = params.get("sort-by");

		let sortSQLPart = ""

		switch (sortOption) {
			case "ascName":
				sortSQLPart = " ORDER BY name ASC";
				break;
			case "descName":
				sortSQLPart = " ORDER BY name DESC";
				break;
			case "ascPrice":
				sortSQLPart = " ORDER BY COALESCE(promoPrice, price) ASC";
				break;
			case "descPrice":
				sortSQLPart = " ORDER BY COALESCE(promoPrice, price) DESC";
				break;
			case "ascSales":
				sortSQLPart = " ORDER BY soldCount ASC";
				break;
			case "descSales":
				sortSQLPart = " ORDER BY soldCount DESC";
				break;
			case "date":
				sortSQLPart = " ORDER BY date DESC";
				break;
		}

		if (genders) conditions.push(`(${
			Object.keys(GENDER_NAMES)
				.filter(value => (genders & value) == value && parseInt(value) > 0)
				.map(value => `genre = ${parseInt(value)}`)
				.join(" OR ")
		})`);

		if (suppliers) conditions.push(`(${
			Object.keys(SUPPLIER_NAMES)
				.filter(value => (suppliers & value) == value)
				.map(value => `supplier = ${value}`)
				.join(" OR ")
		})`);

		if (promos) conditions.push(`(${
			Object.keys(PROMO_VALUES)
				.filter(value => (promos & value) == value)
				.map(value => `promoPrice IS${value == "1" ? " NOT" : ""} NULL`)
				.join(" OR ")
		})`);
		
		if (news) conditions.push(`(${
			Object.keys(NEW_VALUES)
				.filter(value => (news & value) == value)
				.map(value => `date ${value == "1" ? ">" : "<="} ${Date.now() - 1209600000 /* 2 semaines */}`)
				.join(" OR ")
		})`);

		if (pricesParams) conditions.push(`(${pricesParams
			.split(",")
			.map(prices => (prices.split("-").map(price => parseInt(price * 100))))
			.filter(prices => !isNaN(prices[0]) && (!prices[1] || prices[0] < prices[1]))
			.map(prices => `(COALESCE(promoPrice, price) ${prices[1] ? `BETWEEN ${prices[0]} AND ${prices[1]}` : `> ${prices[0]}`})`).join(" OR ")
		})`);

		if (sizesParams) {
			const validSizes = sizesParams.split(",").map(size => parseFloat(size)).filter(size => !isNaN(size));

			if (validSizes.length != 0) conditions.push(`
				EXISTS (
					SELECT 1 FROM stocks WHERE productId = products.id AND quantity > 0 AND size IN (${validSizes.join(", ")})
				)
			`);
		};

		if (searchParams) conditions.push(`name LIKE "%${searchParams}%" OR supplierId = "${searchParams}" OR id = "${searchParams}"`);

		if (colorsParams) conditions.push(`(${
			Object.keys(COLORS)
				.filter(color => (colorsParams & color) == color)
				.map(color => `(colors & ${color}) = ${color}`)
				.join(" OR ")
			})`);

		conditions = conditions.filter(condition => condition && condition != "()");		

		db.all(`
			SELECT
				products.*,
				CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
				CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice
			FROM products${conditions.length != 0 ? ` WHERE ${conditions.join(" AND ")}` : ""}${sortSQLPart};
		`, (err, rows) => {
			if (err) {
				console.error("Erreur lors de la récupération des produits: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else db.all("SELECT DISTINCT size FROM stocks ORDER BY size ASC;", (err, sizes) => {				
				if (err) {
					console.error("Erreur lors de la récupération des tailles: ", err);

					res.writeHead(500, "Internal Server Error").end();
				} else getPage(url, {
					products: rows.map(product => `
						<a href="/produits/${product.id}" class="product-card">
							<img src="${buildImagePath(product, "01-300w.webp")}" alt="Running Shoes">
							<div class="product-info">
								<h3>${product.name}</h3>
								<p class="price">${typeToText(product.genre)}</p>
								<p class="price">${product.formattedPrice}€</p>
								${product.formattedPromoPrice ? `<p class="promo-price">${product.formattedPromoPrice}€</p>` : ""}
							</div>
						</a>
					`).join(""),
					nbProducts: rows.length,
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					sizes: sizes.map(({ size }) => `
					  <div>
            	<input type="checkbox" name="size" value="${size}" id="${size}">
          	  <label class="size-label" for="${size}">${size}</label>
          	</div>
					`).join(""),
					sortOptions: `
						<option id="initial" value="initial"${sortSQLPart == "" ? " selected" : ""}>Résultats initiaux</option>
    	      <option id="ascName" value="ascName"${sortOption == "ascName" ? " selected" : ""}>Nom: A à Z</option>
  	        <option id="descName" value="descName"${sortOption == "descName" ? " selected" : ""}>Nom: Z à A</option>
	          <option id="ascPrice" value="ascPrice"${sortOption == "ascPrice" ? " selected" : ""}>Prix: Croissant</option>
      	    <option id="descPrice" value="descPrice"${sortOption == "descPrice" ? " selected" : ""}>Prix: Décroissant</option>
        	  <option id="ascSales" value="ascSales"${sortOption == "ascSales" ? " selected" : ""}>Meilleurs ventes: Croissant</option>
  		      <option id="descSales" value="descSales"${sortOption == "descSales" ? " selected" : ""}>Meilleurs ventes: Décroissant</option>
	          <option id="date" value="date"${sortOption == "date" ? " selected" : ""}>Date d'arrivée (Nouveautés en premiers)</option>
					`
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
			})
		});
	} else if (url == "/") db.all(`
		SELECT
			*,
			CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
			CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice
		FROM products WHERE date > ?
	`, Date.now() - 1209600000 /* 2 semaines */, (err, newProductsRows) => {
		if (err) {
			console.error("Erreur lors de la récupération des nouveaux produits: ", err);
			res.writeHead(500, "Internal Server Error").end();
		} else db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products ORDER BY soldCount DESC LIMIT 8", (err, bestProductsRows) => {
			if (err) {
				console.error("Erreur lors de la récupération des meilleurs produits: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products WHERE promoPrice IS NOT NULL LIMIT 8", (err, promoProductsRows) => {
				if (err) {
					console.error("Erreur lors de la récupération des produits en promo: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else getPage(url, {
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					newProducts: newProductsRows.map(product => generateProductItem(product, "news")).join(""),
					bestProducts: bestProductsRows.map(product => generateProductItem(product, "best-seller")).join(""),
					promoProducts: promoProductsRows.map(product => generateProductItem(product, "promo")).join(""),
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
			});
		});
	});
	else if (url == "/profil") {
		if (userToken) db.get("SELECT * FROM users WHERE id = ?;", userToken.split(".")?.at(-1), (err, user) => {
			if (err) {
				console.error("Erreur lors de la vérification du token: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else if (!user) res.writeHead(302, { location: "/connexion" }).end();
			else db.all("SELECT products.* FROM products JOIN favorites ON products.id = favorites.productId WHERE userId = ?;", user.id, (err, products) => {																
				if (err) {
					console.log("Erreur lors de la récupération du panier: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else getPage(url, {
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
					success: successMessage ? `<p id="success">${successMessage}</p>` : "",
					username: user.username,
					email: user.email,
					favorites: products.length == 0 ? "<p id='no-favorites'>Il n'y a aucun article dans tes favoris.</p>" : products.map(product => `
						<div class="favorite-item">
							<p style="font-weight: 600;">${product.name}</p> 
							<p style="color: gray;">${typeToText(product.genre)}</p>
							<a href="/produits/${product.id}">
								<img src="${buildImagePath(product, "00.webp")}" alt="airforce1" style="height: 5cm;"> 
							</a>
							<form method="post" action="/favorites/remove" id="favoris-form">
								<button type="submit" class="favoris-btn">
									<svg height="28" version="1.0" viewBox="0 0 24 24" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M16.4,4C14.6,4,13,4.9,12,6.3C11,4.9,9.4,4,7.6,4C4.5,4,2,6.5,2,9.6C2,14,12,22,12,22s10-8,10-12.4C22,6.5,19.5,4,16.4,4z"></path></svg>
									<span>Retirer des favoris</span>
								</button>
								<input type="text" name="location" value="/profil" style="display: none;">
								<input type="text" name="productId" value="${product.id}" style="display: none;">
							</form>
						</div>
					`).join(""),
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
			});
		});
		else res.writeHead(302, { location: "/connexion" }).end();
	} else if (url == "/index" || url == "/produit") res.writeHead(404, "Not found").end();
	else if (url == "/panier") {
		db.all("SELECT *, CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice, CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice FROM products ORDER BY soldCount DESC LIMIT 8", (err, bestProducts) => {
			if (userToken) db.get("SELECT * FROM users WHERE id = ?;", userToken.split(".")?.at(-1), (err, user) => {
				if (err) {
					console.error("Erreur lors de la vérification du token: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else if (!user) {
					const productsInCart = cookies.cart?.split("_") || [];
		
					if (productsInCart.length == 0) getPage(url, {
						bestProducts: bestProducts.map(product => generateProductItem(product, "best-seller")).join(""),
						accountText: userToken ? "Mon compte" : "Se connecter",
						accountLink: userToken ? "/profil" : "/connexion",
						products: "<p>Il n'y a aucun article dans ton panier.</p>",
						sousTotalSansPromo: "",
						totalSansPromo: "",
						productPrices: '<p style="text-align: end; font-weight: 600;">0€</p>',
						total: '<p style="text-align: end; font-weight: 600;">0€</p>',
					}).then(
						data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, {
							...headers,
							"content-type": `text/html`,
							"content-encoding": compression.encoding
						}).end(compression.data)),
						() => res.writeHead(404, "Not found").end()
					);
					else db.all(`
						SELECT
							products.*,
							quantity,
							size,
							CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
							CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice
						FROM products
						JOIN stocks ON products.id = stocks.productId
						WHERE (${Array(productsInCart.length).fill("(products.id = ? AND size = ?)").join(" OR ")});
					`, productsInCart.flatMap(product => product.split("*")), (err, products) => {
						const productsPriceWithoutPromo = products.reduce((prevVal, currVal) => prevVal + currVal.formattedPrice, 0),	
						productsPriceWithPromo = products.reduce((prevVal, currVal) => prevVal + (currVal.formattedPromoPrice || currVal.formattedPrice), 0),
						promo = productsPriceWithoutPromo != productsPriceWithPromo;
		
						if (err) {
							console.error("[1] Erreur lors de la récupération des produits dans le panier: ", err);
							res.writeHead(500, "Internal Server Error").end();
						} else getPage(url, {
							bestProducts: bestProducts.map(product => generateProductItem(product, "best-seller")).join(""),
							accountText: userToken ? "Mon compte" : "Se connecter",
							accountLink: userToken ? "/profil" : "/connexion",
							sousTotalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
							totalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
							...(products.length == 0 ? {
								products: "<p>Il n'y a aucun article dans ton panier.</p>",
								productPrices: '<p style="text-align: end; font-weight: 600;">0€</p>',
								total: '<p style="text-align: end; font-weight: 600;">0€</p>',
							} : {
								products: products.map(product => generateProductItemInCart(product, true, product.isFavorite)).join(`<div class="ligne"></div>`),
								productPrices: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
								total: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
							})
						}).then(
							data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, {
								...headers,
								"content-type": `text/html`,
								"content-encoding": compression.encoding,
								"set-cookie": "token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/;"
							}).end(compression.data)),
							() => res.writeHead(404, "Not found").end()
						);
					});
				} else db.all("SELECT * FROM carts WHERE userId = ?;", user.id, (err, productsInCart) => {				
					if (err) {
						console.log("Erreur lors de la récupération du panier: ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else db.all(`
						SELECT DISTINCT
							products.*,
							quantity,
							stocks.size,
							CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
							CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice,
							CASE 
								WHEN favorites.id IS NOT NULL THEN TRUE 
								ELSE FALSE 
							END AS isFavorite
						FROM products
						JOIN carts ON products.id = carts.productId
						JOIN stocks ON products.id = stocks.productId
						LEFT JOIN favorites ON products.id = favorites.productId AND favorites.userId = ?
						WHERE carts.userId = ?${productsInCart.length != 0 ? ` AND (${Array(productsInCart.length).fill("(products.id = ? AND stocks.size = ?)").join(" OR ")})` : ""};
					`, [user.id, user.id, ...productsInCart.flatMap(product => [product.productId, product.size])], (err, products) => {			
						const productsPriceWithoutPromo = products.reduce((prevVal, currVal) => prevVal + currVal.formattedPrice, 0),	
						productsPriceWithPromo = products.reduce((prevVal, currVal) => prevVal + (currVal.formattedPromoPrice || currVal.formattedPrice), 0),
						promo = productsPriceWithoutPromo != productsPriceWithPromo;
					
						if (err) {
							console.log("[2] Erreur lors de la récupération des produits dans le panier: ", err);
							res.writeHead(500, "Internal Server Error").end();
						} else getPage(url, {
							bestProducts: bestProducts.map(product => generateProductItem(product, "best-seller")).join(""),
							accountText: userToken ? "Mon compte" : "Se connecter",
							accountLink: userToken ? "/profil" : "/connexion",
							sousTotalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
							totalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
							...(products.length == 0 ? {
								products: "<p>Il n'y a aucun article dans ton panier.</p>",
								productPrices: '<p style="text-align: end; font-weight: 600;">0€</p>',
								total: '<p style="text-align: end; font-weight: 600;">0€</p>',
							} : {
								products: products.map(product => generateProductItemInCart(product, true, product.isFavorite)).join(`<div class="ligne"></div>`),
								productPrices: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
								total: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
							})
						}).then(
							data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, {
								...headers,
								"content-type": `text/html`,
								"content-encoding": compression.encoding
							}).end(compression.data)),
							() => res.writeHead(404, "Not found").end()
						);
					});
				});
			});
			else {
				const productsInCart = cookies.cart?.split("_") || [];
	
				if (productsInCart.length == 0) getPage(url, {
					bestProducts: bestProducts.map(product => generateProductItem(product, "best-seller")).join(""),
					accountText: userToken ? "Mon compte" : "Se connecter",
					accountLink: userToken ? "/profil" : "/connexion",
					products: "<p>Il n'y a aucun article dans ton panier.</p>",
					productPrices: '<p style="text-align: end; font-weight: 600;">0€</p>',
					total: '<p style="text-align: end; font-weight: 600;">0€</p>',
					sousTotalSansPromo: "",
					totalSansPromo: "",
				}).then(
					data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, {
						...headers,
						"content-type": `text/html`,
						"content-encoding": compression.encoding
					}).end(compression.data)),
					() => res.writeHead(404, "Not found").end()
				);
				else db.all(`
					SELECT
						products.*,
						quantity,
						size,
						CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
						CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice
					FROM products
					JOIN stocks ON products.id = stocks.productId
					WHERE (${Array(productsInCart.length).fill("(products.id = ? AND size = ?)").join(" OR ")});
				`, productsInCart.flatMap(product => product.split("*")), (err, products) => {
					const productsPriceWithoutPromo = products.reduce((prevVal, currVal) => prevVal + currVal.formattedPrice, 0),	
					productsPriceWithPromo = products.reduce((prevVal, currVal) => prevVal + (currVal.formattedPromoPrice || currVal.formattedPrice), 0),
					promo = productsPriceWithoutPromo != productsPriceWithPromo;
	
					if (err) {
						console.error("[3] Erreur lors de la récupération des produits dans le panier: ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else getPage(url, {
						bestProducts: bestProducts.map(product => generateProductItem(product, "best-seller")).join(""),
						accountText: userToken ? "Mon compte" : "Se connecter",
						accountLink: userToken ? "/profil" : "/connexion",
						sousTotalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
						totalSansPromo: promo ? `<p style="text-align: end; font-weight: 600;" class="without-promo">${productsPriceWithoutPromo}€</p>` : "",
						...(products.length == 0 ? {
							products: "<p>Il n'y a aucun article dans ton panier.</p>",
							productPrices: '<p style="text-align: end; font-weight: 600;">0€</p>',
							total: '<p style="text-align: end; font-weight: 600;">0€</p>',
						} : {
							products: products.map(product => generateProductItemInCart(product, false, false)).join(`<div class="ligne"></div>`),
							productPrices: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
							total: `<p style="text-align: end; font-weight: 600;" ${promo ? "class='promo'" : ""}>${productsPriceWithPromo}€</p>`,
						})
					}).then(
						data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, {
							...headers,
							"content-type": `text/html`,
							"content-encoding": compression.encoding
						}).end(compression.data)),
						() => res.writeHead(404, "Not found").end()
					);
				});
			};
		});
	} else if (url.startsWith("/produits/")) {
		const productId = url.split("/").at(-1), userId = userToken?.split(".")?.at(-1);

		if (userToken) db.get("SELECT * FROM users WHERE id = ?;", userId, (err, user) => {
			if (err) {
				console.error("Erreur lors de la vérification du token: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else if (!user) db.get(`
				SELECT
					name,
					promoPrice,
					supplier,
					genre,
					supplierId,
					CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
					CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice,
					GROUP_CONCAT(stocks.size || '-' || stocks.quantity, ' ') AS stocks
				FROM products
				JOIN stocks ON products.id = stocks.productId
				WHERE products.id = ? GROUP BY products.id;
			`, productId, (err, product) => {				
				if (err) {
					console.error("Erreur lors de la récupération du produit: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else if (!product) res.writeHead(404, "Not found").end();
				else readdir(`./images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${product.supplierId}`, (err, files) => {
					if (err) {
						console.error("Erreur lors de la récupéraction des images du produit: ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else db.all("SELECT id, supplierId FROM products WHERE supplier = ? AND genre = ? AND name = ?", [
						product.supplier,
						product.genre,
						product.name
					], (err, rows) => {
						if (err) {
							console.error("Erreur lors de la récupéraction des produits liés : ", err);
							res.writeHead(500, "Internal Server Error").end();
						} else {
							const firstImageURL = buildImagePath(product, "01");						
							
							getPage("/produit", {
								accountText: userToken ? "Mon compte" : "Se connecter",
								accountLink: userToken ? "/profil" : "/connexion",
								productPresentation: `
									<img src="${firstImageURL}.webp" alt="" id="display" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
									<hr>
									<div id="images-container">
										<img src="${firstImageURL}.webp" alt="" id="current-presentation" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
										${files.filter(file => !file.includes("-")).slice(2).map(file => {
											const url = buildImagePath(product, file.split(".")[0]);
	
											return `<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w">`
										}).join("")}
									</div>
								`,
								productInfos: `
									<div id="text-container">
										<p id="name">${product.name}</p>
										${product.promoPrice ? '<p id="promo">EN PROMOTION</p>' : ""}
									</div>
									<p id="type">${typeToText(product.genre)}</p>
									${product.promoPrice ? `
										<div id="prices">
											<p id="promo-price">${product.formattedPromoPrice}€</p>
											<p id="price">${product.formattedPrice}€</p>
										</div>
									` : `<p id="price">${product.formattedPrice}€</p>`}
								`,
								sizes: product.stocks.split(" ").map(stock => {
									const [size, quantity] = stock.split("-");
		
									return `
										<div>
											<input type="radio" id="${size}" value="${size}" name="size"${quantity == 0 ? " disabled" : ""}>
											<label for="${size}">${size}</label>
										</div>
									`;
								}).join("").replace('"size">', '"size" checked>'),
								linkedProducts: rows.map((row, i) => {
									const url = `/images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${row.supplierId}/00`;
	
									return `
										<a href="/produits/${row.id}" class="container-link ${rows.length - 1 == i ? "last" : ""}">
											<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w" alt="" ${row.supplierId == product.supplierId ? 'class="current-item"' : ""}>
										</a>
									`;
								}).join(""),
								productId: productId,
								error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
								success: successMessage ? `<p id="success">${successMessage}</p>` : ""
							}).then(
								data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
								() => res.writeHead(404, "Not found").end()
							);
						};
					});
				});
			});
			else db.get(`
				SELECT
					products.*,
					CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
					CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice,
					GROUP_CONCAT(stocks.size || '-' || stocks.quantity, ' ') AS stocks,
					CASE 
						WHEN favorites.id IS NOT NULL THEN TRUE 
						ELSE FALSE 
					END AS isFavorite
				FROM products
				JOIN stocks ON products.id = stocks.productId
				LEFT JOIN favorites ON products.id = favorites.productId AND favorites.userId = ?
				WHERE products.id = ?
				GROUP BY products.id;
			`, [userId, productId], (err, product) => {
				if (err) {
					console.error("Erreur lors de la récupération du produit: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else if (!product) res.writeHead(404, "Not found").end();
				else readdir(`./images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${product.supplierId}`, (err, files) => {
					if (err) {
						console.error("Erreur lors de la récupéraction des images du produit: ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else db.all("SELECT id, supplierId FROM products WHERE supplier = ? AND genre = ? AND name = ?", [
						product.supplier,
						product.genre,
						product.name
					], (err, rows) => {
						if (err) {
							console.error("Erreur lors de la récupéraction des produits liés : ", err);
							res.writeHead(500, "Internal Server Error").end();
						} else {
							const firstImageURL = buildImagePath(product, "01");
							
							getPage("/produit", {
								accountText: userToken ? "Mon compte" : "Se connecter",
								accountLink: userToken ? "/profil" : "/connexion",
								productPresentation: `
									<form method="post" action="/favorites/${product.isFavorite ? "remove" : "add"}" class="favoris-form">
										<button type="submit" class="favoris-btn">
											<svg height="32" version="1.0" viewBox="0 0 24 24" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path d="M16.4,4C14.6,4,13,4.9,12,6.3C11,4.9,9.4,4,7.6,4C4.5,4,2,6.5,2,9.6C2,14,12,22,12,22s10-8,10-12.4C22,6.5,19.5,4,16.4,4z"></path></svg>
										</button>
										<input type="text" name="location" value="${url}" style="display: none;">
										<input type="text" name="productId" value="${product.id}" style="display: none;">
									</form>
									<img src="${firstImageURL}.webp" alt="" id="display" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
									<hr>
									<div id="images-container">
										<img src="${firstImageURL}.webp" alt="" id="current-presentation" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
										${files.filter(file => !file.includes("-")).slice(2).map(file => {
											const url = buildImagePath(product, file.split(".")[0]);
	
											return `<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w">`
										}).join("")}
									</div>
								`,
								productInfos: `
									<div id="text-container">
										<p id="name">${product.name}</p>
										${product.promoPrice ? '<p id="promo">EN PROMOTION</p>' : ""}
									</div>
									<p id="type">${typeToText(product.genre)}</p>
									${product.promoPrice ? `
										<div id="prices">
											<p id="promo-price">${product.formattedPromoPrice}€</p>
											<p id="price">${product.formattedPrice}€</p>
										</div>
									` : `<p id="price">${product.formattedPrice}€</p>`}
								`,
								sizes: product.stocks.split(" ").map(stock => {
									const [size, quantity] = stock.split("-");
		
									return `
										<div>
											<input type="radio" id="${size}" value="${size}" name="size"${quantity == 0 ? " disabled" : ""}>
											<label for="${size}">${size}</label>
										</div>
									`;
								}).join("").replace('"size">', '"size" checked>'),
								linkedProducts: rows.map((row, i) => {
									const url = `/images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${row.supplierId}/00`;
	
									return `
										<a href="/produits/${row.id}" class="container-link ${rows.length - 1 == i ? "last" : ""}">
											<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w" alt="" ${row.supplierId == product.supplierId ? 'class="current-item"' : ""}>
										</a>
									`;
								}).join(""),
								productId: productId,
								error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
								success: successMessage ? `<p id="success">${successMessage}</p>` : ""
							}).then(
								data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
								() => res.writeHead(404, "Not found").end()
							);
						};
					});
				});
			});
		});
		else db.get(`
			SELECT
				name,
				promoPrice,
				supplier,
				genre,
				supplierId,
				CAST(price AS DECIMAL(10,2)) / 100.0 AS formattedPrice,
				CAST(promoPrice AS DECIMAL(10,2)) / 100.0 AS formattedPromoPrice,
				GROUP_CONCAT(stocks.size || '-' || stocks.quantity, ' ') AS stocks
			FROM products
			JOIN stocks ON products.id = stocks.productId
			WHERE products.id = ? GROUP BY products.id;
		`, productId, (err, product) => {			
			if (err) {
				console.error("Erreur lors de la récupération du produit: ", err);
				res.writeHead(500, "Internal Server Error").end();
			} else if (!product) res.writeHead(404, "Not found").end();
			else readdir(`./images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${product.supplierId}`, (err, files) => {
				if (err) {
					console.error("Erreur lors de la récupéraction des images du produit: ", err);
					res.writeHead(500, "Internal Server Error").end();
				} else db.all("SELECT id, supplierId FROM products WHERE supplier = ? AND genre = ? AND name = ?", [
					product.supplier,
					product.genre,
					product.name
				], (err, rows) => {
					if (err) {
						console.error("Erreur lors de la récupéraction des produits liés : ", err);
						res.writeHead(500, "Internal Server Error").end();
					} else {
						const firstImageURL = buildImagePath(product, "01");						
						
						getPage("/produit", {
							accountText: userToken ? "Mon compte" : "Se connecter",
							accountLink: userToken ? "/profil" : "/connexion",
							productPresentation: `
								<img src="${firstImageURL}.webp" alt="" id="display" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
								<hr>
								<div id="images-container">
									<img src="${firstImageURL}.webp" alt="" id="current-presentation" srcset="${firstImageURL}-300w.webp 300w, ${firstImageURL}-500w.webp 500w, ${firstImageURL}-1000w.webp 1000w, ${firstImageURL}-1500w.webp 1500w">
									${files.filter(file => !file.includes("-")).slice(2).map(file => {
										const url = buildImagePath(product, file.split(".")[0]);

										return `<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w">`
									}).join("")}
								</div>
							`,
							productInfos: `
								<div id="text-container">
									<p id="name">${product.name}</p>
									${product.promoPrice ? '<p id="promo">EN PROMOTION</p>' : ""}
								</div>
								<p id="type">${typeToText(product.genre)}</p>
								${product.promoPrice ? `
									<div id="prices">
										<p id="promo-price">${product.formattedPromoPrice}€</p>
										<p id="price">${product.formattedPrice}€</p>
									</div>
								` : `<p id="price">${product.formattedPrice}€</p>`}
							`,
							sizes: product.stocks.split(" ").map(stock => {
								const [size, quantity] = stock.split("-");
	
								return `
									<div>
										<input type="radio" id="${size}" value="${size}" name="size"${quantity == 0 ? " disabled" : ""}>
										<label for="${size}">${size}</label>
									</div>
								`;
							}).join("").replace('"size">', '"size" checked>'),
							linkedProducts: rows.map((row, i) => {
								const url = `/images/products/${SUPPLIER_NAMES[product.supplier].toLowerCase().replaceAll(" ", "-")}/${GENDER_NAMES[product.genre][0].toUpperCase()}${row.supplierId}/00`;

								return `
									<a href="/produits/${row.id}" class="container-link ${rows.length - 1 == i ? "last" : ""}">
										<img src="${url}.webp" alt="" srcset="${url}-300w.webp 300w, ${url}-500w.webp 500w, ${url}-1000w.webp 1000w, ${url}-1500w.webp 1500w" alt="" ${row.supplierId == product.supplierId ? 'class="current-item"' : ""}>
									</a>
								`;
							}).join(""),
							productId: productId,
							error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
							success: successMessage ? `<p id="success">${successMessage}</p>` : ""
						}).then(
							data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
							() => res.writeHead(404, "Not found").end()
						);
					};
				});
			});
		});
	} else getPage(url, {
		error: errorMessage ? `<p id="error">${errorMessage}</p>` : "",
		success: successMessage ? `<p id="success">${successMessage}</p>` : "",
		email: params.get("email") || "",
		code: params.get("code") || "",
		accountText: userToken ? "Mon compte" : "Se connecter",
		accountLink: userToken ? "/profil" : "/connexion",
	}).then(
		data => compressData(req.headers["accept-encoding"], data).then(compression => res.writeHead(200, { ...headers, "content-type": `text/html`, "content-encoding": compression.encoding }).end(compression.data)),
		() => res.writeHead(404, "Not found").end()
	);
};

/**
 * @param { string } acceptEncodingHeader 
 * @param { string } data
 * @returns { Promise<{ encoding: string; data: Buffer<ArrayBufferLike>; }> }
 */
function compressData(acceptEncodingHeader, data) {
	const encodings = acceptEncodingHeader.split(",").map(encoding => {
		const [name, qualityValue] = encoding.trim().split(";")				

		return { name, q: parseFloat(qualityValue?.split("=")?.[1] || "1") }
	}).filter(encoding => SUPPORTED_ENCODINGS.includes(encoding.name)),
	bestQValue = Math.max(...encodings.map(encoding => encoding.q)),
	bestEncodings = encodings.filter(encoding => encoding.q == bestQValue),
	bestEncoding = SUPPORTED_ENCODINGS.find(encoding => bestEncodings.some(({ name }) => name == encoding));

	return new Promise(resolve => {
		switch (bestEncoding == "*" ? SUPPORTED_ENCODINGS[1] : bestEncoding) {
			case "gzip":
				gzip(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "gzip", data: res });
				});
				break;
			case "deflate":
				deflate(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "deflate", data: res });
				});
				break;
			case "br":
				brotliCompress(data, (err, res) => {
					if (err) resolve({ encoding: "identity", data });
					else resolve({ encoding: "br", data: res });
				});
				break;
			default:
				resolve({ encoding: "identity", data });
				break;
		};
	});
};

module.exports = {
	securePassword,
	buildImagePath,
	generateProductItemInCart,
	typeToText,
	generateProductItem,
	getPage,
	handleGetRequest
};