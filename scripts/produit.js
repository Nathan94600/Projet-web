const displayImg = document.getElementById("display"),
images = document.querySelectorAll("#images-container img");

for (const img of images) {
	img.addEventListener("click", () => {
		const currPresentation = document.getElementById("current-presentation"),
		currPresentationImgLastPartWithoutExtension = `/${currPresentation.src.split("/").at(-1).split(".")[0]}`;

		if (img.id != "current-presentation") {
			const imgLastPartWithoutExtension = `/${img.src.split("/").at(-1).split(".")[0]}`;			
			
			displayImg.src = displayImg.src.replace(currPresentationImgLastPartWithoutExtension, imgLastPartWithoutExtension);
			displayImg.srcset = displayImg.srcset.replaceAll(currPresentationImgLastPartWithoutExtension, imgLastPartWithoutExtension);
			img.id = "current-presentation";
			currPresentation.id = "";
		};
	});
};