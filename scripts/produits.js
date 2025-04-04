const filtres = document.querySelector(".filtres"),
genres = document.querySelectorAll("#genres .checkbox-container input"),
marques = document.querySelectorAll("#marques .checkbox-container input"),
promos = document.querySelectorAll("#promos .checkbox-container input"),
news = document.querySelectorAll("#news .checkbox-container input"),
prices = document.querySelectorAll("#prices .checkbox-container input"),
sizes = document.querySelectorAll("#sizes .size-grid input"),
colors = document.querySelectorAll("#colors .color-options input"),
sortOption = document.querySelector(".sort-select");

const params = new URL(window.location.href).searchParams, search = params.get("search") || "";

const defaultGenres = parseInt(params.get("genres")) || 0,
defaultMarques = parseInt(params.get("marques")) || 0,
defaultPromos = parseInt(params.get("promos")) || 0,
defaultNews = parseInt(params.get("news")) || 0,
defaultPrices = params.get("prices") ? params.get("prices").split(",") : [],
defaultSizes = params.get("sizes") ? params.get("sizes").split(",") : [],
defaultColors = parseInt(params.get("couleurs")) || 0,
defaultSortOption = params.get("sort-by") || "initial";

if (params.get("scroll")) filtres.scrollTop = parseInt(params.get("scroll")) || 0;

sortOption.addEventListener("change", () => window.location.assign(
	"/produits?" +
	`scroll=${filtres.scrollTop}` +
	`&sort-by=${sortOption.value}` +
	`&search=${search}` +
	`&marques=${defaultMarques}` +
	`&promos=${defaultPromos}` +
	`&news=${defaultNews}` +
	`&prices=${defaultPrices}` +
	`&sizes=${defaultSizes}` +
	`&couleurs=${defaultColors}` +
	`&genres=${defaultGenres}`
));

genres.forEach(input => {
	const value = parseInt(input.value);

	if ((defaultGenres & value) === value) input.checked = true;

	input.addEventListener("change", () => window.location.assign(
		"/produits?" +
		`scroll=${filtres.scrollTop}` +
		`&sort-by=${defaultSortOption}` +
		`&search=${search}` +
		`&marques=${defaultMarques}` +
		`&promos=${defaultPromos}` +
		`&news=${defaultNews}` +
		`&prices=${defaultPrices}` +
		`&sizes=${defaultSizes}` +
		`&couleurs=${defaultColors}` +
		`&genres=${defaultGenres + value * (input.checked ? 1 : -1)}`
	));
});

marques.forEach(input => {
	const value = parseInt(input.value);

	if ((defaultMarques & value) === value) input.checked = true;

	input.addEventListener("change", () => window.location.assign(
		"/produits?" +
		`scroll=${filtres.scrollTop}` +
		`&sort-by=${defaultSortOption}` +
		`&search=${search}` +
		`&genres=${defaultGenres}` +
		`&promos=${defaultPromos}` +
		`&news=${defaultNews}` +
		`&prices=${defaultPrices}` +
		`&sizes=${defaultSizes}` +
		`&couleurs=${defaultColors}` +
		`&marques=${defaultMarques + value * (input.checked ? 1 : -1)}`
	));
});

promos.forEach(input => {
	const value = parseInt(input.value);

	if ((defaultPromos & value) === value) input.checked = true;

	input.addEventListener("change", () => window.location.assign(
		"/produits?" +
		`scroll=${filtres.scrollTop}` +
		`&sort-by=${defaultSortOption}` +
		`&search=${search}` +
		`&genres=${defaultGenres}` +
		`&marques=${defaultMarques}` +
		`&news=${defaultNews}` +
		`&prices=${defaultPrices}` +
		`&sizes=${defaultSizes}` +
		`&couleurs=${defaultColors}` +
		`&promos=${defaultPromos + value * (input.checked ? 1 : -1)}`
	));
});

news.forEach(input => {
	const value = parseInt(input.value);

	if ((defaultNews & value) === value) input.checked = true;

	input.addEventListener("change", () => window.location.assign(
		"/produits?" +
		`scroll=${filtres.scrollTop}` +
		`&sort-by=${defaultSortOption}` +
		`&search=${search}` +
		`&genres=${defaultGenres}` +
		`&marques=${defaultMarques}` +
		`&promos=${defaultPromos}` +
		`&prices=${defaultPrices}` +
		`&sizes=${defaultSizes}` +
		`&couleurs=${defaultColors}` +
		`&news=${defaultNews + value * (input.checked ? 1 : -1)}`
	));
});

prices.forEach(input => {
	const value = input.value;	

	if (defaultPrices.includes(value)) input.checked = true;

	input.addEventListener("change", () => {
		if (input.checked) defaultPrices.push(value);
		else defaultPrices.splice(defaultPrices.indexOf(value), 1);

		console.log(prices, defaultPrices);
		

		window.location.assign(
			"/produits?" +
			`scroll=${filtres.scrollTop}` +
			`&sort-by=${defaultSortOption}` +
			`&search=${search}` +
			`&genres=${defaultGenres}` +
			`&marques=${defaultMarques}` +
			`&promos=${defaultPromos}` +
			`&news=${defaultNews}` +
			`&sizes=${defaultSizes}` +
			`&couleurs=${defaultColors}` +
			`&prices=${defaultPrices.join(",")}`
		);
	});
});

sizes.forEach(input => {
	const value = input.value;	

	if (defaultSizes.includes(value)) input.checked = true;

	input.addEventListener("change", () => {
		if (input.checked) defaultSizes.push(value);
		else defaultSizes.splice(defaultSizes.indexOf(value), 1);		

		window.location.assign(
			"/produits?" +
			`scroll=${filtres.scrollTop}` +
			`&sort-by=${defaultSortOption}` +
			`&search=${search}` +
			`&genres=${defaultGenres}` +
			`&marques=${defaultMarques}` + 
			`&promos=${defaultPromos}` + 
			`&news=${defaultNews}` + 
			`&prices=${defaultPrices}` +
			`&couleurs=${defaultColors}` +
			`&sizes=${defaultSizes.join(",")}`
		);
	});
});

colors.forEach(input => {
	const value = parseInt(input.value);

	if ((defaultColors & value) === value) input.checked = true;

	input.addEventListener("change", () => window.location.assign(
		"/produits?" +
		`scroll=${filtres.scrollTop}` +
		`&sort-by=${defaultSortOption}` +
		`&search=${search}` +
		`&genres=${defaultGenres}` +
		`&marques=${defaultMarques}` +
		`&promos=${defaultPromos}` +
		`&news=${defaultNews}` +
		`&prices=${defaultPrices}` +
		`&sizes=${defaultSizes}` +
		`&couleurs=${defaultColors + value * (input.checked ? 1 : -1)}`
	));
});