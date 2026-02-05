---
layout: cv
title: Jonas Lau Frandsen's Projects
---
# Projects
A collection of my professional and personal projects.

<div id="webaddress">
<a href="index.html">← Back to CV</a> | <a href="mailto:color@laufrandsen.dk">color@laufrandsen.dk</a>
</div>

## All Projects

{% for project in site.data.projects %}
`{{ project.date }}`
__{{ project.title }}__{% if project.highlighted %} ⭐{% endif %}

{{ project.description }}

{% if project.responsibilities %}
{% for resp in project.responsibilities %}- {{ resp }}
{% endfor %}
{% endif %}

{% if project.technologies %}
**Technologies:** {{ project.technologies | join: ", " }}
{% endif %}

{% if project.link and project.link != "" %}
[View Project]({{ project.link }})
{% endif %}

{% endfor %}
