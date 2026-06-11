---
layout: cv
title: Jonas Lau Frandsen's Projects
---

<header class="hero">
<span class="eyebrow">Projects</span>
<h1>Selected work. <span class="dim">Professional &amp; personal.</span></h1>
<div class="hero-links">
<a class="arrow-link" href="index.html">Back to CV</a>
<a class="arrow-link" href="mailto:color@laufrandsen.dk">color@laufrandsen.dk</a>
</div>
</header>

<section class="section" id="all-projects">
<div class="section-grid">
<div class="section-label"><span class="eyebrow">All projects</span></div>
<div class="section-body">
{% for project in site.data.projects %}
<div class="project-card" style="margin-bottom: 1rem;">
<span class="project-date">{{ project.date }}</span>
<h3>{{ project.title }}</h3>
<p>{{ project.description }}</p>
{% if project.responsibilities %}
<ul>
{% for resp in project.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
{% endif %}
<div class="project-footer">
{% if project.technologies %}
<div class="tag-list">
{% for tech in project.technologies %}<span class="tag">{{ tech }}</span>{% endfor %}
</div>
{% endif %}
{% if project.link and project.link != "" %}
<a class="arrow-link" href="{{ project.link }}">View project</a>
{% endif %}
</div>
</div>
{% endfor %}
</div>
</div>
</section>
