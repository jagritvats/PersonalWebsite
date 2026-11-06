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

	// ---- Diagram animation ----
	// animateDiagram(svg, config) moves tokens along waypoint paths and fires timed changes.
	//
	//   tokens:   [{ el, path, start }]  path is a list of [ms, x, y] waypoints, and start (ms)
	//             delays the whole path. Draw tokens under the nodes, so the stretches inside a
	//             node read as the node handling the event. Tokens show while a run plays.
	//   events:   [[ms, el, action]]  action is 'show' or 'hide' (fades a mark in or out), class
	//             changes such as '+is-ok' or '-is-retry +is-fail', or a function(el).
	//   duration: length of a run in ms.
	//   replay:   the button that plays it again.
	//
	// el is an element or a selector inside svg. The SVG as written is the finished picture:
	// marks with a 'show' event are hidden when a run starts, and every element an event touches
	// gets its classes back. So without JS, or with reduced motion, the static diagram is complete.
	// A run starts once the diagram scrolls into view; with reduced motion only the button starts it.
	function animateDiagram(svg, config) {
		const find = el => (typeof el === 'string' ? svg.querySelector(el) : el);
		const tokens = config.tokens.map(({ el, path, start = 0 }) => ({ el: find(el), path, start }));
		const events = config.events
			.map(([at, el, action]) => [at, find(el), action])
			.sort((a, b) => a[0] - b[0]);
		const targets = new Set([...tokens.map(token => token.el), ...events.map(event => event[1])]);
		const initialClass = new Map([...targets].map(el => [el, el.getAttribute('class')]));
		const marks = new Set(events.filter(event => event[2] === 'show').map(event => event[1]));
		const button = config.replay;

		function apply(el, action) {
			if (typeof action === 'function') {
				action(el);
			} else if (action === 'show' || action === 'hide') {
				el.style.opacity = action === 'show' ? '1' : '0';
			} else {
				action.split(/\s+/).forEach(change => {
					if (change[0] === '+') el.classList.add(change.slice(1));
					if (change[0] === '-') el.classList.remove(change.slice(1));
				});
			}
		}

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
			targets.forEach(el => {
				el.setAttribute('class', initialClass.get(el));
				if (el.style.opacity) el.style.opacity = '';
			});
			tokens.forEach(({ el }) => el.setAttribute('opacity', '1'));
			marks.forEach(el => (el.style.opacity = '0'));

			const start = performance.now();
			let next = 0;

			function tick(now) {
				const t = now - start;
				tokens.forEach(token => place(token.el, token.path, t - token.start));
				while (next < events.length && events[next][0] <= t) {
					const [, el, action] = events[next++];
					apply(el, action);
				}
				if (t < config.duration) {
					frame = requestAnimationFrame(tick);
				} else {
					tokens.forEach(({ el }) => el.setAttribute('opacity', '0'));
				}
			}

			frame = requestAnimationFrame(tick);
		}

		if (button) {
			button.hidden = false;
			button.addEventListener('click', play);
		}

		if (reduceMotion.matches || !('IntersectionObserver' in window)) {
			if (button) button.textContent = 'Play the flow';
		} else {
			// Play once, when the diagram is actually on screen (the hero's sits below the intro on phones).
			const observer = new IntersectionObserver(entries => {
				if (entries.some(entry => entry.isIntersecting)) {
					observer.disconnect();
					setTimeout(play, 400);
				}
			}, { threshold: 0.6 });
			observer.observe(svg);
		}

		return { play };
	}

	// ---- Hero diagram: one event succeeds; another is retried twice, then dead-lettered ----
	const flow = document.querySelector('.diagram--hero .dg');
	const replayBtn = document.getElementById('replayBtn');

	if (flow && replayBtn) {
		const a = '[data-token="a"]';
		const b = '[data-token="b"]';
		const startB = 1700;

		animateDiagram(flow, {
			tokens: [
				{ el: a, path: [[0, 76, 35], [450, 76, 112], [800, 76, 158], [1400, 76, 232], [1500, 76, 255]] },
				{
					el: b,
					start: startB,
					path: [
						[0, 76, 35], [450, 76, 112], [750, 76, 127], [800, 140, 127], // consumer fails it
						[1250, 196, 127], [1300, 274, 135], [2000, 196, 143], // waits in the retry topic
						[2450, 140, 143], [2750, 76, 135], [2800, 140, 127], // second attempt fails too
						[3250, 196, 127], [3700, 274, 158], [4300, 274, 232], [4400, 274, 255], // dead-lettered
					],
				},
			],
			events: [
				[650, a, '+is-ok'],
				[1450, '.dot--ok', 'show'],
				[startB + 1300, b, '+is-retry'],
				[startB + 3500, b, '-is-retry +is-fail'],
				[startB + 4350, '.dot--fail', 'show'],
			],
			duration: startB + 4400,
			replay: replayBtn,
		});
	}

	// ---- TeamTakes diagram: team A reads its own rows; the same user asking for team B gets nothing ----
	const teams = document.querySelector('#teamtakes .dg');
	const teamsReplay = document.getElementById('ttReplayBtn');

	if (teams && teamsReplay) {
		const a = '[data-token="a"]';
		const x = '[data-token="x"]';
		const startX = 1900;

		animateDiagram(teams, {
			tokens: [
				// Down to Postgres, a beat inside it, then back up carrying team A's rows.
				{ el: a, path: [[0, 52, 35], [500, 52, 153], [1000, 52, 168], [1050, 52, 153], [1550, 52, 35]] },
				// A team A user tagging the request as team B: row-level security turns it away.
				{ el: x, start: startX, path: [[0, 140, 35], [500, 140, 149], [850, 140, 149], [1150, 140, 116]] },
			],
			events: [
				[1000, a, '+is-ok'],
				[1500, '.dot--ok', 'show'],
				[startX + 850, x, '+is-fail'],
				[startX + 1150, '.tt-x', 'show'],
				[startX + 1150, x, 'hide'],
				// The two guards that keep it that way.
				[startX + 1500, '.node[data-guard="leak"]', '+is-pulse'],
				[startX + 1500, '.e[data-guard="leak"]', '+is-pulse'],
				[startX + 1700, '.node[data-guard="migration"]', '+is-pulse'],
				[startX + 1700, '.e[data-guard="migration"]', '+is-pulse'],
			],
			duration: startX + 3000,
			replay: teamsReplay,
		});
	}
	// ---- Share buttons on posts ----
	// The share links work without JS. These two buttons only appear when the browser can do them.
	document.querySelectorAll('[data-share-url]').forEach(box => {
		const url = box.dataset.shareUrl;
		const title = box.dataset.shareTitle;
		const status = box.querySelector('.share__status');
		const nativeBtn = box.querySelector('[data-share-native]');
		const copyBtn = box.querySelector('[data-share-copy]');
		let clearStatus;

		function say(message) {
			status.textContent = message;
			clearTimeout(clearStatus);
			clearStatus = setTimeout(() => (status.textContent = ''), 4000);
		}

		if (nativeBtn && navigator.share) {
			nativeBtn.hidden = false;
			nativeBtn.addEventListener('click', () => {
				navigator.share({ title, url }).catch(() => {}); // closing the share sheet rejects; that's fine
			});
		}

		if (copyBtn && navigator.clipboard && window.isSecureContext) {
			copyBtn.hidden = false;
			copyBtn.addEventListener('click', () => {
				navigator.clipboard.writeText(url).then(
					() => say('Link copied.'),
					() => say("Couldn't copy the link. It's " + url),
				);
			});
		}
	});
})();
