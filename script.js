(function () {
	const root = document.documentElement;
	const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
	const themeBtn = document.getElementById('themeBtn');
	const themeColorMetas = document.querySelectorAll('meta[name="theme-color"]');

	// ---- Theme: follows the system until the visitor picks one ----
	function currentTheme() {
		return root.getAttribute('data-theme') || (systemDark.matches ? 'dark' : 'light');
	}

	function syncThemeUi() {
		const theme = currentTheme();
		themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
		const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
		themeColorMetas.forEach(meta => meta.setAttribute('content', paper));
	}

	themeBtn.addEventListener('click', () => {
		const next = currentTheme() === 'dark' ? 'light' : 'dark';
		root.setAttribute('data-theme', next);
		try {
			localStorage.setItem('theme', next);
		} catch (e) {}
		syncThemeUi();
	});

	systemDark.addEventListener('change', syncThemeUi);
	syncThemeUi();

	// ---- Footer year ----
	document.querySelectorAll('[data-year]').forEach(el => {
		el.textContent = new Date().getFullYear();
	});

	// ---- Hero diagram: one event succeeds; another is retried twice, then dead-lettered ----
	const flow = document.querySelector('.diagram--hero .dg');
	const replayBtn = document.getElementById('replayBtn');

	if (flow && replayBtn) {
		const tokenA = flow.querySelector('[data-token="a"]');
		const tokenB = flow.querySelector('[data-token="b"]');
		const dotOk = flow.querySelector('.dot--ok');
		const dotFail = flow.querySelector('.dot--fail');

		// Waypoints as [ms, x, y]. Tokens are drawn under the nodes, so the stretches
		// inside a node (the pauses) read as the node handling the event.
		const pathA = [[0, 76, 35], [450, 76, 112], [800, 76, 158], [1400, 76, 232], [1500, 76, 255]];
		const pathB = [
			[0, 76, 35], [450, 76, 112], [750, 76, 127], [800, 140, 127], // consumer fails it
			[1250, 196, 127], [1300, 274, 135], [2000, 196, 143], // waits in the retry topic
			[2450, 140, 143], [2750, 76, 135], [2800, 140, 127], // second attempt fails too
			[3250, 196, 127], [3700, 274, 158], [4300, 274, 232], [4400, 274, 255], // dead-lettered
		];
		const startB = 1700;
		const total = startB + 4400;

		const events = [
			[650, () => tokenA.classList.add('is-ok')],
			[1450, () => dotOk.style.opacity = '1'],
			[startB + 1300, () => tokenB.classList.add('is-retry')],
			[startB + 3500, () => tokenB.classList.replace('is-retry', 'is-fail')],
			[startB + 4350, () => dotFail.style.opacity = '1'],
		];

		function place(token, path, t) {
			let [, x, y] = path[path.length - 1];
			if (t <= path[0][0]) {
				[, x, y] = path[0];
			} else {
				for (let i = 1; i < path.length; i++) {
					if (t <= path[i][0]) {
						const [t0, x0, y0] = path[i - 1];
						const [t1, x1, y1] = path[i];
						const k = (t - t0) / (t1 - t0);
						x = x0 + (x1 - x0) * k;
						y = y0 + (y1 - y0) * k;
						break;
					}
				}
			}
			token.setAttribute('cx', x.toFixed(1));
			token.setAttribute('cy', y.toFixed(1));
		}

		let frame = 0;

		function play() {
			cancelAnimationFrame(frame);
			[tokenA, tokenB].forEach(token => {
				token.setAttribute('class', 'tok');
				token.setAttribute('opacity', '1');
			});
			dotOk.style.opacity = '0';
			dotFail.style.opacity = '0';

			const start = performance.now();
			let next = 0;

			function tick(now) {
				const t = now - start;
				place(tokenA, pathA, t);
				place(tokenB, pathB, t - startB);
				while (next < events.length && events[next][0] <= t) {
					events[next++][1]();
				}
				if (t < total) {
					frame = requestAnimationFrame(tick);
				} else {
					tokenA.setAttribute('opacity', '0');
					tokenB.setAttribute('opacity', '0');
				}
			}

			frame = requestAnimationFrame(tick);
		}

		replayBtn.hidden = false;
		replayBtn.addEventListener('click', play);

		if (reduceMotion.matches || !('IntersectionObserver' in window)) {
			replayBtn.textContent = 'Play the flow';
		} else {
			// Play once, when the diagram is actually on screen (it sits below the intro on phones).
			const observer = new IntersectionObserver(entries => {
				if (entries.some(entry => entry.isIntersecting)) {
					observer.disconnect();
					setTimeout(play, 400);
				}
			}, { threshold: 0.6 });
			observer.observe(flow);
		}
	}
})();
