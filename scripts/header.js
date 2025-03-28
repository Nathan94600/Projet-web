const header = document.querySelector("header");

let lastScrollY = window.scrollY;

window.addEventListener("scroll", () => {
	console.log(window.scrollY);
	
	if (lastScrollY < window.scrollY || window.scrollY == 0) header.classList.remove("sticky");
	else if (window.scrollY > header.clientHeight * 2.5) header.classList.add("sticky");

	lastScrollY = window.scrollY;
});