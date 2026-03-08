const root = document.documentElement;
const roleElement = document.getElementById('role-text');

const roles = [
	'Software Engineer',
	'Backend Developer',
	'Systems Thinker',
	'Problem Solver'
];

let roleIndex = 0;
let textLength = roles[roleIndex].length;
let removeInterval, addInterval;

function removeText() {
	roleElement.innerText = roles[roleIndex].substring(0, textLength - 1);
	textLength--;
	if (textLength === 0) {
		clearInterval(removeInterval);
		roleIndex = (roleIndex + 1) % roles.length;
		textLength = 0;
		addInterval = setInterval(addText, 80);
	}
}

function addText() {
	roleElement.innerText = roles[roleIndex].substring(0, textLength + 1);
	textLength++;
	if (textLength === roles[roleIndex].length) {
		clearInterval(addInterval);
		textLength = roles[roleIndex].length;
		setTimeout(() => {
			removeInterval = setInterval(removeText, 60);
		}, 2000);
	}
}

function switchTheme() {
	const current = root.getAttribute('data-theme');
	const next = current === 'light' ? 'dark' : 'light';
	root.setAttribute('data-theme', next);
	localStorage.setItem('theme', next);
}

function init() {
	// Set initial role text
	roleElement.innerText = roles[roleIndex];

	// Start typing animation after pause
	setTimeout(() => {
		removeInterval = setInterval(removeText, 60);
	}, 2000);

	// Load saved theme
	const savedTheme = localStorage.getItem('theme') || 'dark';
	if (savedTheme === 'light') {
		root.setAttribute('data-theme', 'light');
	}

	// Theme button
	const themeBtn = document.getElementById('themeBtn');
	themeBtn.addEventListener('click', switchTheme);

	// Disable image dragging
	document.querySelectorAll('img').forEach(img => {
		img.ondragstart = () => false;
	});

	// Smooth reveal on scroll
	const observer = new IntersectionObserver((entries) => {
		entries.forEach(entry => {
			if (entry.isIntersecting) {
				entry.target.style.opacity = '1';
				entry.target.style.transform = 'translateY(0)';
			}
		});
	}, { threshold: 0.1 });

	document.querySelectorAll('.section').forEach(section => {
		section.style.opacity = '0';
		section.style.transform = 'translateY(20px)';
		section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
		observer.observe(section);
	});
}

init();
