const header = document.querySelector("header");
const nav = document.querySelector("nav");
const actionContainer = document.querySelector("#action-container");
const hamburger = document.querySelector(".hamburger");
const hamburgerMenu = document.querySelector("#hamburger-menu");

let lastScrollY = window.scrollY;

// Sticky header functionality
window.addEventListener("scroll", () => {
    if (window.innerWidth > 768) {
        if (lastScrollY < window.scrollY || window.scrollY === 0) {
            header.classList.remove("sticky");
        } else if (window.scrollY > header.clientHeight * 2.5) {
            header.classList.add("sticky");
        }
    } else {
        header.classList.remove("sticky");
    }

    lastScrollY = window.scrollY;
});

// Toggle hamburger menu
hamburger.addEventListener("click", () => {
    hamburgerMenu.classList.toggle("active");
    hamburger.classList.toggle("open");

    // Add profile, search, and basket to the hamburger menu
    if (hamburgerMenu.classList.contains("active")) {
        const clonedActionContainer = actionContainer.cloneNode(true);
        clonedActionContainer.id = "hamburger-action-container"; // Avoid duplicate IDs
        hamburgerMenu.appendChild(clonedActionContainer);
    } else {
        const existingActionContainer = document.querySelector("#hamburger-action-container");
        if (existingActionContainer) {
            existingActionContainer.remove();
        }
    }
});