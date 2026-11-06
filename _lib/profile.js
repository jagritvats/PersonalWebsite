// Turns _data/profile.json into the copies of the profile that tools read:
// the homepage JSON-LD, resume.json (JSON Resume) and llms.txt.

const MONTHS = [
	"January", "February", "March", "April", "May", "June",
	"July", "August", "September", "October", "November", "December",
];

// A profile value is either one string for every output, or an object whose
// "text" is the shared wording and whose "page" / "llms" / "resume" keys
// override it for that output.
export function pick(value, output) {
	if (value === null || typeof value !== "object") return value;
	return value[output] ?? value.text;
}

// "2023-07" -> "July 2023" (long) or "Jul 2023" (short)
export function monthYear(yearMonth, style = "long") {
	const [year, month] = String(yearMonth).split("-").map(Number);
	const name = MONTHS[month - 1];
	if (!name) throw new Error(`Expected a YYYY-MM date, got "${yearMonth}"`);
	return `${style === "short" ? name.slice(0, 3) : name} ${year}`;
}

export function rolePeriod(role, style = "long") {
	return `${monthYear(role.start, style)} to ${role.end ? monthYear(role.end, style) : "now"}`;
}

// The whole time at a company: first role's start to last role's end.
export function jobPeriod(job, style = "long") {
	const first = job.roles[0];
	const last = job.roles[job.roles.length - 1];
	return rolePeriod({ start: first.start, end: last.end }, style);
}

export function currentRole(job) {
	return job.roles[job.roles.length - 1];
}

export function sentenceCase(text) {
	const lower = text.toLowerCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// "A, B, and C" (and "A, and B" for two, which is how the role summaries read)
function joinRoles(items) {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// "A, B and C"
function joinAnd(items) {
	if (items.length <= 1) return items.join("");
	return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// Newest role first: "Software Development Engineer since October 2025", ...
function roleClauses(job) {
	return [...job.roles].reverse().map((role) =>
		role.end
			? `${role.title} from ${monthYear(role.start)} to ${monthYear(role.end)}`
			: `${role.title} since ${monthYear(role.start)}`,
	);
}

export function phoneDisplay(phone) {
	return `${phone.countryCode} ${phone.number}`;
}

export function phoneTel(phone) {
	return `${phone.countryCode}${phone.number}`.replace(/\s+/g, "");
}

function phoneJsonLd(phone) {
	return `${phone.countryCode}-${phone.number.replace(/\s+/g, "")}`;
}

export function degreeName(edu, joiner = ", ") {
	return `${edu.studyType}${joiner}${edu.area}`;
}

export function degreeSummary(edu) {
	return `${edu.startDate} to ${edu.endDate}, CGPA ${edu.gpa} out of ${edu.gpaScale}`;
}

// Serialise for a <script type="application/ld+json"> block. "<" is escaped so
// no string can close the script element.
export function jsonForScript(value, indent = "") {
	return JSON.stringify(value, null, "\t")
		.replace(/</g, "\\u003c")
		.split("\n")
		.map((line) => indent + line)
		.join("\n");
}

// ---- Homepage JSON-LD (schema.org) ----
export function homeJsonLd(p, site) {
	const base = p.url;
	const personId = `${base}#person`;
	const job = p.jobs.find((j) => !currentRole(j).end);
	const edu = p.education[0];

	const person = {
		"@type": "Person",
		"@id": personId,
		name: p.name,
		givenName: p.givenName,
		familyName: p.familyName,
		url: base,
		...(job && { jobTitle: currentRole(job).title }),
		description: p.summary.jsonld,
		email: `mailto:${p.email}`,
		telephone: phoneJsonLd(p.phone),
		address: {
			"@type": "PostalAddress",
			addressLocality: p.location.city,
			addressRegion: p.location.region,
			addressCountry: p.location.countryCode,
		},
		...(job && {
			worksFor: { "@type": "Organization", name: job.company, url: job.url },
		}),
		alumniOf: { "@type": "CollegeOrUniversity", name: edu.institution, url: edu.url },
		hasOccupation: {
			"@type": "Occupation",
			name: p.jsonld.occupation,
			occupationLocation: { "@type": "City", name: p.location.city },
			skills: p.jsonld.skills,
		},
		knowsAbout: p.jsonld.knowsAbout,
		hasCredential: [
			...p.education.map((e) => ({
				"@type": "EducationalOccupationalCredential",
				credentialCategory: "degree",
				name: degreeName(e),
				recognizedBy: { "@type": "CollegeOrUniversity", name: e.institution },
			})),
			...p.certificates.items.map((c) => ({
				"@type": "EducationalOccupationalCredential",
				credentialCategory: "certification",
				name: p.certificates.namePrefix + c.name,
				...(c.url && { url: c.url }),
			})),
		],
		...(p.photo && {
			image: {
				"@type": "ImageObject",
				"@id": `${base}#photo`,
				url: p.photo.url,
				contentUrl: p.photo.url,
				width: p.photo.width,
				height: p.photo.height,
				caption: p.name,
			},
		}),
		sameAs: p.profiles.map((profile) => profile.url),
	};

	const projects = p.projects
		.filter((project) => project.jsonld)
		.map((project) => {
			const { "@type": type, description, ...extra } = project.jsonld;
			return {
				"@type": type,
				"@id": `${base}#${project.id}`,
				name: project.name,
				url: project.url,
				...(extra.sameAs && { sameAs: extra.sameAs }),
				...(project.repo && { codeRepository: project.repo }),
				...(extra.programmingLanguage && { programmingLanguage: extra.programmingLanguage }),
				description,
				creator: { "@id": personId },
			};
		});

	return {
		"@context": "https://schema.org",
		"@graph": [
			{
				"@type": "WebSite",
				"@id": `${base}#website`,
				url: base,
				name: p.name,
				...(p.username && { alternateName: p.username }),
				...(p.siteDescription && { description: p.siteDescription }),
				inLanguage: site.lang,
				publisher: { "@id": personId },
				author: { "@id": personId },
			},
			{
				"@type": "ProfilePage",
				"@id": `${base}#profile`,
				url: base,
				name: `${p.name}, ${p.label.toLowerCase()}`,
				isPartOf: { "@id": `${base}#website` },
				mainEntity: { "@id": personId },
				...(p.photo && { primaryImageOfPage: { "@id": `${base}#photo` } }),
				dateModified: p.updated,
				inLanguage: site.lang,
			},
			person,
			...projects,
		],
	};
}

// ---- BlogPosting JSON-LD for one post ----
export function postJsonLd(post, p, site) {
	const url = `${site.url}${post.url}`;
	return {
		"@context": "https://schema.org",
		"@type": "BlogPosting",
		"@id": `${url}#post`,
		url,
		mainEntityOfPage: url,
		headline: post.title,
		...(post.description && { description: post.description }),
		datePublished: isoDate(post.date),
		dateModified: isoDate(post.updated || post.date),
		inLanguage: site.lang,
		image: `${site.url}${post.image || site.ogImage}`,
		author: {
			"@type": "Person",
			"@id": `${p.url}#person`,
			name: p.name,
			url: p.url,
		},
		isPartOf: {
			"@type": "Blog",
			"@id": `${site.url}/writing/#blog`,
			name: `${site.writing.title} by ${p.name}`,
			url: `${site.url}/writing/`,
		},
	};
}

// ---- resume.json (https://jsonresume.org/schema, v1.0.0) ----
export function resume(p, site) {
	return {
		$schema: "https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json",
		basics: {
			name: p.name,
			label: p.label,
			...(p.photo && { image: p.photo.url }),
			email: p.email,
			phone: phoneDisplay(p.phone),
			url: p.url,
			summary: p.summary.resume,
			location: {
				city: p.location.city,
				region: p.location.region,
				countryCode: p.location.countryCode,
			},
			profiles: p.profiles,
		},
		work: p.jobs.map((job) => {
			const first = job.roles[0];
			const last = currentRole(job);
			const [newest, ...older] = roleClauses(job);
			return {
				name: job.company,
				...(job.url && { url: job.url }),
				position: last.title,
				startDate: first.start,
				...(last.end && { endDate: last.end }),
				...(job.roles.length > 1 && { summary: `${newest}. ${joinRoles(older)}.` }),
				highlights: job.highlights.map((h) => pick(h, "resume")),
			};
		}),
		education: p.education.map((e) => ({
			institution: e.institution,
			url: e.url,
			area: e.area,
			studyType: e.studyType,
			startDate: e.startDate,
			endDate: e.endDate,
			score: `${e.gpa}/${e.gpaScale} CGPA`,
		})),
		certificates: p.certificates.items.map((c) => ({
			name: p.certificates.namePrefix + c.name,
			issuer: p.certificates.issuer,
			...(c.url && { url: c.url }),
		})),
		skills: p.skills.map((s) => ({ name: pick(s.name, "resume"), keywords: s.keywords })),
		projects: p.projects
			.filter((project) => project.resume)
			.map((project) => ({
				name: project.name,
				description: project.resume.description,
				url: project.url,
				...(project.resume.highlights && { highlights: project.resume.highlights }),
				keywords: project.resume.keywords,
			})),
		meta: {
			canonical: `${site.url}/resume.json`,
			version: "v1.0.0",
			lastModified: p.updated,
		},
	};
}

// Tab-indented, with keyword lists kept on one line.
export function formatResume(value) {
	const json = JSON.stringify(value, null, "\t").replace(
		/("keywords": )\[\n([\s\S]*?)\n\t*\]/g,
		(_, key, items) => `${key}[${items.split("\n").map((line) => line.trim()).join(" ")}]`,
	);
	return `${json}\n`;
}

// ---- llms.txt (https://llmstxt.org/) ----
export function llms(p, site, posts = []) {
	const lines = [];
	const add = (...more) => lines.push(...more);

	add(`# ${p.name}`, "", `> ${p.summary.llms}`, "");
	add(
		`This file summarises ${p.url} for language models and other tools. A structured résumé is at ${site.url}/resume.json in JSON Resume format.`,
		"",
	);

	add("## Contact", "");
	add(`- Email: ${p.email}`, `- Phone: ${phoneDisplay(p.phone)}`);
	for (const profile of p.profiles) add(`- [${profile.network}](${profile.url})`);
	add(`- [Website](${p.url})`);
	if (p.photo) add(`- [Photo](${p.photo.url})`);
	add("");

	add("## Experience", "");
	for (const job of p.jobs) {
		const head =
			job.roles.length > 1
				? `${job.company}, ${jobPeriod(job)}. ${joinRoles(roleClauses(job))}.`
				: `${job.company}, ${currentRole(job).title.toLowerCase()}, ${jobPeriod(job)}.`;
		const highlights = job.highlights.map((h) => pick(h, "llms"));
		if (highlights.length === 1) {
			add(`- ${head} ${highlights[0]}`);
		} else {
			add(`- ${head}`);
			for (const h of highlights) add(`  - ${h}`);
		}
	}
	add("");

	add("## Projects", "");
	for (const project of p.projects) {
		if (!project.llms) continue;
		const name = project.url ? `[${project.name}](${project.url})` : project.name;
		const code = project.repo ? ` [Code on GitHub](${project.repo})` : "";
		add(`- ${name}: ${project.llms}${code}`);
	}
	add("");

	if (posts.length) {
		add("## Writing", "");
		add(`Posts are listed at ${site.url}/writing/ and in the Atom feed at ${site.url}/feed.xml.`, "");
		for (const post of posts) {
			const description = post.data.description ? `: ${post.data.description}` : "";
			add(`- [${post.data.title}](${site.url}${post.url}), ${isoDate(post.date)}${description}`);
		}
		add("");
	}

	add("## Skills", "");
	for (const skill of p.skills) add(`- ${pick(skill.name, "llms")}: ${pick(skill.list, "llms")}`);
	add("");

	add("## Education", "");
	for (const e of p.education) {
		add(`- ${e.institution}, ${degreeName(e, " in ")}, ${degreeSummary(e)}`);
	}
	const certs = p.certificates.items.map((c) => (c.url ? `[${c.name}](${c.url})` : c.name));
	add(`- ${p.certificates.issuer} certifications: ${joinAnd(certs)}`);

	return `${lines.join("\n")}\n`;
}

// ---- Dates ----
export function isoDate(date) {
	return new Date(date).toISOString().slice(0, 10);
}

// "5 November 2026"
export function readableDate(date) {
	const d = new Date(date);
	return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
