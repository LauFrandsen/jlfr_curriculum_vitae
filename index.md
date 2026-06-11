---
layout: cv
title: Jonas Lau Frandsen's CV
---

<header class="hero">
<span class="eyebrow">Curriculum Vitae &middot; Copenhagen, Denmark</span>
<h1>Jonas Lau Frandsen. <span class="dim">Senior AI Engineer.</span></h1>
<p class="hero-summary">I design and build AI and ML systems end-to-end — from problem to prototype to production. Purely agentic flows and traditional ML wrapped in agents: chat with your data <em>and</em> get predictive insights from the same system.</p>
<div class="hero-links">
<a class="arrow-link" href="mailto:color@laufrandsen.dk">color@laufrandsen.dk</a>
<a class="arrow-link" href="https://www.linkedin.com/in/laufrandsen">LinkedIn</a>
<a class="arrow-link" href="tel:+4541667726">+45 41 66 77 26</a>
<a class="arrow-link screen-only" href="#" onclick="window.print(); return false;">Download PDF</a>
<span class="print-only">Printed from <a href="https://laufrandsen.dk/">laufrandsen.dk</a> — the web version is kept current.</span>
</div>
</header>

<div class="stats">
<div class="stat"><div class="stat-number">3+</div><div class="stat-label">years shipping AI &amp; ML in production</div></div>
<div class="stat"><div class="stat-number">DK-wide</div><div class="stat-label">train predictions in production — used by passengers across Denmark</div></div>
<div class="stat"><div class="stat-number">10</div><div class="stat-label">years of D&amp;D with the same party — fully committed on all fronts</div></div>
</div>

<section class="section" id="about">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">About</span></div>
<div class="section-body">
<p class="section-intro">Senior AI Engineer at <a href="https://heyra.io/">Heyra</a>, where we take ideas from problem to prototype to production — combining rapid experimentation with enterprise engineering to turn data, ML and AI agents into measurable business impact.</p>
<p>Passionate and results-driven AI Engineer &amp; Data Scientist with a solid background in software development. As Data Scientist and Team Lead on a DSB x Netcompany project, I helped develop and ship AI-driven predictions for Danish trains — a solution serving passengers across all of Denmark. I manage Proof of Concept projects and scale them into impactful, productionised machine learning solutions that deliver tangible business value.</p>
<p>I work hypothesis-first: the rigor of data science meeting the craft of actually building and shipping AI. Alongside hands-on engineering I act as a trusted advisor on fast-moving technologies, making sure what we build delivers value rather than novelty.</p>
</div>
</div>
</section>

<section class="section" id="focus">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Focus areas</span></div>
<div class="section-body">
<div class="focus-list">
<div class="focus-item"><span class="focus-num">01</span><h3>Agentic workflows</h3><p>Designing and building agent systems — LangChain, PydanticAI, MCP, RAG — that act on real business processes.</p></div>
<div class="focus-item"><span class="focus-num">02</span><h3>Machine learning &amp; decision intelligence</h3><p>Traditional ML wrapped in agents: predictive maintenance, time-series prediction, classification — surfaced where decisions happen.</p></div>
<div class="focus-item"><span class="focus-num">03</span><h3>Document extraction</h3><p>Language-model extraction pipelines with observability (Langfuse) that hold up in production.</p></div>
<div class="focus-item"><span class="focus-num">04</span><h3>LLM evaluation</h3><p>Designing and running evals for correctness, reliability and quality — RAGAS, human-in-the-loop, synthetic data.</p></div>
<div class="focus-item"><span class="focus-num">05</span><h3>Data foundations</h3><p>The groundwork that keeps AI and ML systems reliable in production: pipelines, MLOps, monitoring.</p></div>
<div class="focus-item"><span class="focus-num">06</span><h3>Spec-driven development</h3><p>From a clear spec to shipped AI and ML fast — agentic coding workflows, terminal-first.</p></div>
</div>
</div>
</div>
</section>

<section class="section" id="experience">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Experience &amp; education</span></div>
<div class="section-body">
{% for entry in site.data.experience %}{% if entry.show_on_main %}
<div class="timeline-entry {% if entry.current %}current{% endif %}" data-type="{{ entry.type }}">
<div class="timeline-company"><strong>{{ entry.company }}</strong></div>
<div class="timeline-positions">
{% for pos in entry.positions %}
<div class="timeline-position">
<div class="position-header">
<em>{{ pos.title }}</em>
<code class="date-code">{{ pos.date_start }}&ndash;{{ pos.date_end }}</code>
</div>
<ul class="position-details">
{% for resp in pos.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
</div>
{% endfor %}
</div>
</div>
{% endif %}{% endfor %}

<details class="previous-experience">
<summary>Previous experience &amp; education</summary>
{% for entry in site.data.experience %}{% unless entry.show_on_main %}
<div class="timeline-entry" data-type="{{ entry.type }}">
<div class="timeline-company"><strong>{{ entry.company }}</strong></div>
<div class="timeline-positions">
{% for pos in entry.positions %}
<div class="timeline-position">
<div class="position-header">
<em>{{ pos.title }}</em>
<code class="date-code">{{ pos.date_start }}&ndash;{{ pos.date_end }}</code>
</div>
<ul class="position-details">
{% for resp in pos.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
</div>
{% endfor %}
</div>
</div>
{% endunless %}{% endfor %}
</details>
</div>
</div>
</section>

<section class="section" id="highlighted-project">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Selected project</span></div>
<div class="section-body">
{% assign highlighted_project = site.data.projects | where: "highlighted", true | first %}
{% if highlighted_project %}
<div class="project-card">
<span class="project-date">{{ highlighted_project.date }}</span>
<h3>{{ highlighted_project.title }}</h3>
<p>{{ highlighted_project.description }}</p>
<ul>
{% for resp in highlighted_project.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
<div class="project-footer">
<div class="tag-list">
{% for tech in highlighted_project.technologies %}<span class="tag">{{ tech }}</span>{% endfor %}
</div>
<a class="arrow-link screen-only" href="projects.html">All projects</a>
</div>
</div>
{% endif %}
</div>
</div>
</section>

<section class="section" id="skills">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Technical skills</span></div>
<div class="section-body">
<div class="skill-group">
<h3>LLMs &amp; AI agents</h3>
<div class="tag-list"><span class="tag">LangChain</span><span class="tag">LlamaIndex</span><span class="tag">PydanticAI</span><span class="tag">MCP</span><span class="tag">RAG</span><span class="tag">Vector databases</span><span class="tag">Prompt engineering</span><span class="tag">Structured output</span><span class="tag">Fine-tuning</span><span class="tag">Synthetic data</span><span class="tag">Langfuse</span><span class="tag">RAGAS</span><span class="tag">Human-in-the-loop evals</span><span class="tag">Document extraction</span><span class="tag">Claude Code</span></div>
<p class="skill-note">Experience with all major frontier AI lab APIs — OpenAI, Anthropic, Google, Meta.</p>
</div>
<div class="skill-group">
<h3>Data science &amp; ML</h3>
<div class="tag-list"><span class="tag">Deep learning</span><span class="tag">Traditional ML</span><span class="tag">Computer vision</span><span class="tag">Time-series prediction</span><span class="tag">Neuroevolution</span><span class="tag">Statistical analysis</span><span class="tag">MLflow</span></div>
</div>
<div class="skill-group">
<h3>Languages &amp; big data</h3>
<div class="tag-list"><span class="tag">Python</span><span class="tag">SQL</span><span class="tag">Java</span><span class="tag">PySpark</span><span class="tag">Hadoop</span><span class="tag">Ray / HPC</span></div>
</div>
<div class="skill-group">
<h3>Cloud &amp; MLOps</h3>
<div class="tag-list"><span class="tag">Databricks</span><span class="tag">Azure</span><span class="tag">Cloud model deployment</span><span class="tag">ModelMesh</span><span class="tag">AI health monitoring</span><span class="tag">Linux / macOS / Windows</span></div>
</div>
</div>
</div>
</section>

<section class="section" id="beyond">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Beyond the code</span></div>
<div class="section-body">
<div class="trait-list">
<div class="trait"><h3>Team leadership</h3><p>Team and project lead experience — planning, motivating, coordinating, and delivering successfully.</p></div>
<div class="trait"><h3>Communication</h3><p>Strong stakeholder management; conveying complex technical topics to non-technical audiences, including presenting to large rooms.</p></div>
<div class="trait"><h3>Business-to-solution thinking</h3><p>Translating stakeholder conversations into concrete, valuable data solutions. Impact over novelty — solving real problems, not building gimmicks.</p></div>
<div class="trait"><h3>Problem-solving &amp; adaptability</h3><p>Analytical thinker, quick to learn and apply new technologies; flexible across changing requirements and organisations.</p></div>
<div class="trait"><h3>Languages</h3><p>Danish (native) &middot; English (fluent)</p></div>
</div>
</div>
</div>
</section>

<section class="section" id="contact">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">Contact</span></div>
<div class="section-body">
<div class="terminal-card">
<div class="terminal-bar"><span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-dot"></span><span class="terminal-title">jonas@cph ~ </span></div>
<div class="terminal-body">
<span class="prompt">$</span> <span class="cmd">contact</span> --jonas<br>
<span class="prompt">&gt;</span> email&nbsp;&nbsp;&nbsp;&nbsp;<a href="mailto:color@laufrandsen.dk">color@laufrandsen.dk</a><br>
<span class="prompt">&gt;</span> linkedin&nbsp;<a href="https://www.linkedin.com/in/laufrandsen">linkedin.com/in/laufrandsen</a><br>
<span class="prompt">&gt;</span> phone&nbsp;&nbsp;&nbsp;&nbsp;<a href="tel:+4541667726">+45 41 66 77 26</a><br>
<span class="prompt">&gt;</span> based&nbsp;&nbsp;&nbsp;&nbsp;Copenhagen, Denmark
</div>
</div>
</div>
</div>
</section>
