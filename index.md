---
layout: cv
title: Jonas Lau Frandsen's CV
---
# Jonas Lau Frandsen
AI Engineering, Data Science, Software Development
<div id="webaddress">
<a href="mailto:color@laufrandsen.dk">color@laufrandsen.dk</a> | <a href="https://www.linkedin.com/in/laufrandsen">My LinkedIn page</a> | <a href="tel:+4541667726">+45 41 66 77 26</a>
<span class="print-only"><br><a href="https://laufrandsen.dk/">Viewing in PDF? See webpage for better formatting</a></span>
</div>

## Currently

Working as a Senior AI Engineer at [Heyra](https://heyra.io/), designing and building AI and ML systems end-to-end — from problem to prototype to production. I build both purely agentic flows and traditional ML wrapped in agents, delivering the real AI experience: chat with your data and get predictive insights from the same system.

### Professional Profile

Passionate and results-driven AI Engineer & Data Scientist with a solid background in software development. In my role as both a Data Scientist and Team Lead on a DSB x Netcompany project, I successfully partook in the development and implementation of AI-driven predictions for Danish trains, a solution with customers in all of Denmark. This experience has equipped me with the ability to manage Proof of Concept projects and scale them into impactful machine learning solutions that deliver tangible business value, through productionalized models.

I have worked with both traditional ML such as predictive maintenance, data clustering, classifiers, timeseries prediction and regression, as well as Deep Learning, where my expertise area has been computer vision. I have strong experience with LLMs, including agentic workflows, document extraction and LLM evaluation.

I thrive in collaborative team environments, leveraging my strong technical expertise and versatile skill set to drive projects forward effectively. I'm proactive by nature, always taking initiative to ensure goals are met and obstacles are addressed promptly.

### Specialized in

Agentic AI, Machine Learning, Data Science, Team-leading, Software Development and Data Visualization

## Highlighted project

{% assign highlighted_project = site.data.projects | where: "highlighted", true | first %}
{% if highlighted_project %}
`{{ highlighted_project.date }}`
__{{ highlighted_project.title }}__
{% for resp in highlighted_project.responsibilities %}- {{ resp }}
{% endfor %}
<span class="screen-only" style="font-size: 0.85em; color: var(--text-muted);">[View all projects](projects.html)</span>
{% endif %}

## Education and work experience

<div class="career-timeline" data-source="experience">
{% for entry in site.data.experience %}{% if entry.show_on_main %}
<div class="timeline-entry {% if entry.current %}current{% endif %}" data-type="{{ entry.type }}">
<div class="timeline-company">
<strong>{{ entry.company }}</strong>
</div>
<div class="timeline-positions">
{% for pos in entry.positions %}
<div class="timeline-position {% if pos.promoted %}promoted{% endif %}">
<div class="position-marker"></div>
<div class="position-content">
<div class="position-header">
<em>{{ pos.title }}</em>
<code class="date-code">{{ pos.date_start }}-{{ pos.date_end }}</code>
</div>
<ul class="position-details">
{% for resp in pos.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
</div>
</div>
{% endfor %}
</div>
</div>
{% endif %}{% endfor %}
</div>

<details class="previous-experience screen-only">
<summary>Previous Experience and Education</summary>
{% for entry in site.data.experience %}{% unless entry.show_on_main %}
<div class="timeline-entry" data-type="{{ entry.type }}">
<div class="timeline-company">
<strong>{{ entry.company }}</strong>
</div>
<div class="timeline-positions">
{% for pos in entry.positions %}
<div class="timeline-position">
<div class="position-content">
<div class="position-header">
<em>{{ pos.title }}</em>
<code class="date-code">{{ pos.date_start }}-{{ pos.date_end }}</code>
</div>
<ul class="position-details">
{% for resp in pos.responsibilities %}<li>{{ resp }}</li>
{% endfor %}</ul>
</div>
</div>
{% endfor %}
</div>
</div>
{% endunless %}{% endfor %}
</details>

## Technical Skills

__Programming Languages__ 
- Python - Incredibly strong background for both low-level and high-level programming.
- Java
- SQL

__Data Science and ML__
- Deep Learning, Traditional ML, Neuroevolution, Statistical Analysis, Mlflow.

__LLMs and AI Agents__
- LangChain, LlamaIndex, PydanticAI, MCP, RAG, Vector Databases, Prompt Engineering, Few-shot Prompting, Structured Output, Fine-tuning, Synthetic Data Generation, Langfuse, RAGAS, Human-in-the-loop Evaluation, Document Extraction, Claude Code (quick prototyping).
- Experience with all major frontier AI lab APIs (OpenAI, Anthropic, Google, Meta).

__Big Data Technologies__ 
- PySpark, Hadoop File System (HFS), High-Performance Computing (HPC) with Ray as multiprocess enabler.

__Cloud and MlOps__ 
- Databricks, Cloud deployment of AI models, MLOps, ModelMesh, AI Health Monitoring set-ups, Virtual machines mainly on Azure platforms.

__Systems__ 
- Experienced with Linux, Windows, and macOS

__Security__ 
- Fundamental understanding of information security and why it is important. 

## Personal Skills

__Team Leadership__ 
- Experience as Team Lead with the ability to motivate and coordinate teams.
- Experience as Project lead with understanding of project planning, team management and successful deliveries.

__Communication__ 
- Strong stakeholder management skills.
- Adept at conveying complex technical topics to non-technical audiences.
- Mastery of presenting for medium to large audiences on complex matters in an understandable way.

__Business-to-Solution Thinking__
- Skilled at translating stakeholder conversations and business needs into concrete, valuable data solutions.
- Focus on delivering impact over novelty — actively listening to customers and stakeholders to build solutions that solve real problems, not technical gimmicks.

__Problem-Solving__
- Analytical thinker with the ability to quickly learn and apply new technologies and methods.

__Adaptability__ 
- Highly flexible with the ability to adapt to changing project requirements, technologies and the organisation around projects.

### Languages

__Danish__ 
- Native Language

__English__ 
- Fluent

<div class="print-only">
This CV was printed from my online portfolio. For the most up-to-date version, please visit my website.
</div>
