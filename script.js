const roleElement = document.getElementById('role-text');
const roles = [
	'Web Developer',
	'Cloud Enthusiast',
	'Coder',
	'Cyber Sec Enthusiast',
];

let currentThemeVar;

var roleIndex = 0,
	textLength = roles[roleIndex].length;

var removeInterval, addInterval;

function removeText() {
	roleElement.innerText = roles[roleIndex].substring(0, textLength - 1);
	textLength--;
	if (textLength == 0) {
		clearInterval(removeInterval);
		roleIndex = (roleIndex + 1) % roles.length;
		textLength = 0;
		addInterval = setInterval(addText, 200);
	}
}

function addText() {
	roleElement.innerText = roles[roleIndex].substring(0, textLength + 1); // adding space in innerText didn't increase it's length in HTML
	textLength++;
	if (textLength == roles[roleIndex].length) {
		clearInterval(addInterval);
		textLength = roles[roleIndex].length;
		setTimeout(() => {
			removeInterval = setInterval(removeText, 200);
		}, 500); // pause for a while after text is completed
	}
}

function switchTheme() {
	// --primary-dark-bg: #483756;
	// --secondary-dark-bg: #564785;
	// --tertiary-dark-bg: #343431;
	//
	// --primary-darktheme-fg: #FFFADE;
	// --secondary-darktheme-fg: #F0C961;
	// --tertiary-darktheme-fg: #F6EBFF;
	// swap
	// get current theme
	console.log('Switch theme called ', localStorage.getItem('theme'));

	const root = document.querySelector(':root');

	const props = getComputedStyle(root);

	const currentTheme = localStorage.getItem('theme')
		? localStorage.getItem('theme')
		: props.getPropertyValue('--theme');

	console.log(currentTheme);

	let primarydarkbg = props.getPropertyValue('--primary-dark-bg');
	let secondarydarkbg = props.getPropertyValue('--secondary-dark-bg');
	let tertiarydarkbg = props.getPropertyValue('--tertiary-dark-bg');
	let plaincol = props.getPropertyValue('--plain-col');

	let primarydarkthemefg = props.getPropertyValue('--primary-darktheme-fg');
	let secondarydarkthemefg = props.getPropertyValue(
		'--secondary-darktheme-fg'
	);
	let tertiarydarkthemefg = props.getPropertyValue('--tertiary-darktheme-fg');
	let plaindark = props.getPropertyValue('--plain-dark');

	// we don't need to even check, just swap ( later: update var names )
	root.style.setProperty('--primary-dark-bg', primarydarkthemefg);
	root.style.setProperty('--secondary-dark-bg', secondarydarkthemefg);
	root.style.setProperty('--tertiary-dark-bg', tertiarydarkthemefg);
	root.style.setProperty('--plain-col', plaindark);

	root.style.setProperty('--primary-darktheme-fg', primarydarkbg);
	root.style.setProperty('--secondary-darktheme-fg', secondarydarkbg);
	root.style.setProperty('--tertiary-darktheme-fg', tertiarydarkbg);
	root.style.setProperty('--plain-dark', plaincol);

	// extra elems
	const more_cert_btn = document.querySelector('.more_cert_btn');
	const hero_section = document.querySelector('.heroSection__right img');
	const theme_btn = document.querySelector('#themeBtn img');

	//project__links
	const plinks = document.querySelectorAll('.project__link img');
	//findMe
	const footer_icons = document.querySelectorAll('.footer__icon');

	if (currentTheme == 'dark') {
		localStorage.setItem('theme', 'light');
		// change the theme to light
		root.style.setProperty('--theme', 'light');
		root.style.setProperty('color-scheme', 'light');

		more_cert_btn.style.setProperty('filter', 'invert(1)');
		hero_section.style.setProperty('filter', 'invert(1)');
		theme_btn.style.setProperty('filter', 'invert(1)');

		for (let i = 0; i < plinks.length; i++) {
			plinks[i].style.setProperty('filter', 'invert(1)');
		}
		for (let i = 0; i < footer_icons.length; i++) {
			footer_icons[i].style.setProperty('filter', 'invert(1)');
		}
	} else {
		// change the theme to dark
		localStorage.setItem('theme', 'dark');

		root.style.setProperty('--theme', 'dark');
		root.style.setProperty('color-scheme', 'dark');

		more_cert_btn.style.setProperty('filter', 'none');
		hero_section.style.setProperty('filter', 'none');
		theme_btn.style.setProperty('filter', 'none');

		for (var i = 0; i < plinks.length; i++) {
			plinks[i].style.setProperty('filter', 'none');
			plinks[i].style.setProperty('-webkit-filter', 'none');
		}
		for (var i = 0; i < footer_icons.length; i++) {
			footer_icons[i].style.setProperty('filter', 'none');
			plinks[i].style.setProperty('-webkit-filter', 'none');
		}
	}
}

function init() {
	console.log('init');
	console.log(localStorage.getItem('theme'));
	roleElement.innerText = roles[roleIndex];
	setTimeout(() => {
		removeInterval = setInterval(removeText, 200);
	}, 500);

	var imgs = document.getElementsByTagName('img');
	imgs = [...imgs];
	imgs.forEach((img) => {
		img.ondragstart = () => {
			return false;
		};
	});

	if (localStorage.getItem('theme') == 'light') {
		console.log('Switching theme.');
		switchTheme();
	}

	const themeBtn = document.getElementById('themeBtn');
	themeBtn.addEventListener('click', switchTheme);

	// manually set skill images?
}

init();
