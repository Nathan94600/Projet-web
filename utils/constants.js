module.exports = {
	COMPONENT_REGEX: /(?<!\\)(?:\\\\)*\[[A-z]+\]/g,
	VARIABLE_REGEX: /(?<!\\)(?:\\\\)*{{[A-z]+}}/g,
	EMAIL_REGEX: /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
	SUPPORTED_ENCODINGS: ["*", "br", "deflate", "gzip"],
	COLORS: {
		[2**0]: "rouge",
		[2**1]: "bleu",
		[2**2]: "noir",
		[2**3]: "violet",
		[2**4]: "vert",
		[2**5]: "orange",
		[2**6]: "jaune",
		[2**7]: "rose",
		[2**8]: "blanc",
		[2**9]: "marron",
		[2**10]: "gris",
	},
	SUPPLIER_NAMES: {
		[2**0]: "New Balance",
		[2**1]: "Puma",
		[2**2]: "Nike",
		[2**3]: "Asics",
		[2**4]: "Adidas",
	},
	GENDER_NAMES: {
		[2**0]: "homme",
		[2**1]: "femme",
		[2**2]: "enfant",
		[2**3]: "mixte",
	},
	PROMO_VALUES: {
		[2**0]: "true",
		[2**1]: "false",
	},
	NEW_VALUES: {
		[2**0]: "true",
		[2**1]: "false",
	}
};