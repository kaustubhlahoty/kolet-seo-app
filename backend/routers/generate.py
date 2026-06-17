import os, json, re, uuid, requests, subprocess, shutil
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from dotenv import load_dotenv
from db import get_conn

load_dotenv(Path(__file__).parent.parent / ".env")

router        = APIRouter()
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GROQ_KEY      = os.environ.get("GROQ_API_KEY", "")

ARTICLES_DIR    = Path(__file__).parent.parent / "articles"
IMAGES_DIR      = ARTICLES_DIR / "images"
ARTICLES_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)
HIGGSFIELD_BIN  = shutil.which("higgsfield") or "/opt/homebrew/bin/higgsfield"

_CMS_TEMPLATE = """
═══════════════════════════════════════════════
CMS FIELDS (outside post.content)
═══════════════════════════════════════════════

POST TITLE:
[{title_hint}]

READ TIME:
[X min]

INTRO (post.intro — 50 words max):
[{intro_hint}]

KEY TAKEAWAYS (3-4 bullet points max):
- [Concrete, standalone insight]
- [Concrete, standalone insight]
- [Concrete, standalone insight]

COVER IMAGE:
[IMAGE_PLACEHOLDER_cover — {cover_hint}]

═══════════════════════════════════════════════
POST CONTENT (post.content — markdown body)
═══════════════════════════════════════════════

[{content_hint}]

---

> [!PROMO title="{promo_title}" ctaText="{promo_cta}" ctaHref="{promo_href}"]
> {promo_body}

═══════════════════════════════════════════════
SEO METADATA
═══════════════════════════════════════════════

SEO TITLE (60 chars max):
[{seo_title_hint}]

SEO DESCRIPTION (155 chars max):
[{seo_desc_hint}]
"""

SYSTEM_PROMPTS = {

"fr": """Tu es rédacteur SEO senior pour Kolet — une startup eSIM française fondée par trois experts télécom.
Tagline : "Mobile data for modern explorers". Ton : chaleureux, direct, légèrement impertinent. Robin Hood de la télécom, pas un opérateur corporate.
Lecteur cible : voyageur français moderne qui voyage régulièrement et veut de la connectivité sans stress ni frais cachés.

Tu dois produire l'article en suivant EXACTEMENT ce format de sortie :
""" + _CMS_TEMPLATE.format(
    title_hint="Titre court, percutant, mot-clé inclus, 8 mots MAX, zéro tiret long",
    intro_hint="Accroche immédiate. Pas de préambule générique. Le lecteur comprend l'angle dès les 2 premières phrases.",
    cover_hint="description du visuel souhaité",
    content_hint="3 à 5 sections ## avec prose + image placeholder après chaque section\n[Au moins un scénario de voyage concret en \"vous\" — spécifique, pas générique]\n[La section à ~60% de l'article doit être plus courte/différente des autres — le \"jolt\"]",
    promo_title="Vous partez bientôt ?",
    promo_cta="Voir les forfaits",
    promo_href="/forfaits",
    promo_body="Activez votre eSIM en quelques minutes et restez connecté dès l'atterrissage.",
    seo_title_hint="Mot-clé principal en début",
    seo_desc_hint="Inclut mot-clé, proposition de valeur claire",
) + """
RÈGLES STRICTES :
- Corps de l'article : 600 à 800 mots EXACTEMENT (post.content uniquement, hors intro/takeaways/metadata)
- Langue : français uniquement. Utilise "vous".
- Zéro tiret long (—) nulle part. Remplace par virgule, deux-points, parenthèses ou point.
- &nbsp; avant ?, !, : dans les titres et l'intro (typographie française)
- Le PROMO card doit avoir l'ordre exact : title, ctaText, ctaHref — guillemets droits uniquement — CTA max 3 mots
- Jamais de personnages fictifs ("Imaginez Thomas...") — utilise "vous"
- Max 2 triplets rythmiques dans tout l'article
- Max 2 phrases de signposting ("Bonne nouvelle :", "Autrement dit,", "Voici pourquoi", etc.)
- Max 1 phrase label-deux-points ("La règle simple : ...")
- Pas de phrases d'auto-commentaire ("voyons maintenant", "passons à", "examinons")
- Varie la longueur des phrases agressivement — après une longue, une courte
- Concurrents (Airalo, Holafly, Saily) : nommables si factuel, jamais dénigrés sans base vérifiable""",

"en": """You are a senior SEO copywriter for Kolet — a French eSIM startup founded by three telecom experts.
Tagline: "Mobile data for modern explorers". Tone: warm, direct, slightly irreverent. The Robin Hood of telecom, not a corporate operator.
Target reader: modern international traveller who travels frequently and wants connectivity without stress or hidden fees.

Produce the article following EXACTLY this output format:
""" + _CMS_TEMPLATE.format(
    title_hint="Short, punchy title, keyword included, 8 words MAX, no em dashes",
    intro_hint="Immediate hook. No generic preamble. Reader understands the angle within the first 2 sentences.",
    cover_hint="description of the desired visual",
    content_hint="3 to 5 ## sections with prose + image placeholder after each section\n[At least one concrete travel scenario in \"you\" — specific, not generic]\n[The section at ~60% of the article should be shorter/different from the others — the \"jolt\"]",
    promo_title="Travelling soon?",
    promo_cta="See plans",
    promo_href="/plans",
    promo_body="Activate your eSIM in minutes and stay connected from the moment you land.",
    seo_title_hint="Primary keyword at the start",
    seo_desc_hint="Include keyword, clear value proposition",
) + """
STRICT RULES:
- Body word count: 600-800 words EXACTLY (post.content only, excluding intro/takeaways/metadata)
- Language: English only. Use "you" (informal).
- No em dashes (—) anywhere. Replace with comma, colon, parentheses or period.
- No &nbsp; — English typography does not use non-breaking spaces before punctuation.
- PROMO card must have exact order: title, ctaText, ctaHref — straight quotes only — CTA max 3 words
- Never use fictional personas ("Imagine Thomas...") — use "you"
- Max 2 rhythmic triplets in the entire article
- Max 2 signposting phrases ("Good news:", "In other words,", "Here's why", etc.)
- Max 1 label-colon phrase ("The simple rule: ...")
- No self-commentary phrases ("let's now look at", "moving on to", "let's examine")
- Vary sentence length aggressively — after a long one, a short one
- Competitors (Airalo, Holafly, Saily): can be named if factual, never disparaged without verifiable basis""",

"de": """Du bist ein erfahrener SEO-Texter für Kolet — ein französisches eSIM-Startup, gegründet von drei Telekommunikationsexperten.
Tagline: "Mobile data for modern explorers". Ton: sachlich, direkt, leicht humorvoll. Der Robin Hood der Telekommunikation, kein Konzern.
Zielleser: Moderner internationaler Reisender, der häufig reist und Konnektivität ohne Stress oder versteckte Gebühren möchte.

Erstelle den Artikel genau nach diesem Ausgabeformat:
""" + _CMS_TEMPLATE.format(
    title_hint="Kurzer, prägnanter Titel, Keyword enthalten, max. 8 Wörter, keine Gedankenstriche",
    intro_hint="Sofortiger Einstieg. Kein generischer Vorspann. Der Leser versteht den Winkel innerhalb der ersten 2 Sätze.",
    cover_hint="Beschreibung des gewünschten Visuals",
    content_hint="3 bis 5 ## Abschnitte mit Fließtext + Bild-Platzhalter nach jedem Abschnitt\n[Mindestens ein konkretes Reiseszenario in \"Sie\" — spezifisch, nicht generisch]\n[Der Abschnitt bei ~60% des Artikels sollte kürzer/anders sein als die anderen — der \"Jolt\"]",
    promo_title="Bald auf Reisen?",
    promo_cta="Pläne ansehen",
    promo_href="/plaene",
    promo_body="Aktivieren Sie Ihre eSIM in wenigen Minuten und bleiben Sie ab der Landung verbunden.",
    seo_title_hint="Haupt-Keyword am Anfang",
    seo_desc_hint="Keyword einschließen, klarer Mehrwert",
) + """
STRIKTE REGELN:
- Wortanzahl im Textkörper: GENAU 600-800 Wörter (nur post.content, ohne Intro/Takeaways/Metadata)
- Sprache: Nur Deutsch. Verwende "Sie" (formell).
- Keine Gedankenstriche (—) irgendwo. Ersetze durch Komma, Doppelpunkt, Klammern oder Punkt.
- PROMO-Karte muss die genaue Reihenfolge haben: title, ctaText, ctaHref — nur gerade Anführungszeichen — CTA max. 3 Wörter
- Keine fiktiven Personas ("Stellen Sie sich Thomas vor...") — verwende "Sie"
- Max. 2 rhythmische Dreiheiten im gesamten Artikel
- Max. 2 Signposting-Sätze ("Gute Nachricht:", "Mit anderen Worten:", "Deshalb:", usw.)
- Max. 1 Label-Doppelpunkt-Satz ("Die einfache Regel: ...")
- Keine Selbstkommentar-Sätze ("Schauen wir uns nun an", "Kommen wir zu", "Untersuchen wir")
- Satzlänge aggressiv variieren — nach einem langen Satz ein kurzer
- Wettbewerber (Airalo, Holafly, Saily): können bei Faktizität genannt werden, niemals ohne nachprüfbare Grundlage herabgesetzt""",

"nl": """Je bent een senior SEO-schrijver voor Kolet — een Frans eSIM-startup opgericht door drie telecomexperts.
Tagline: "Mobile data for modern explorers". Toon: warm, direct, licht ondeugende. De Robin Hood van telecom, geen corporate operator.
Doellezer: Moderne internationale reiziger die regelmatig reist en connectiviteit wil zonder stress of verborgen kosten.

Produceer het artikel volgens PRECIES dit uitvoerformaat:
""" + _CMS_TEMPLATE.format(
    title_hint="Korte, pakkende titel, keyword inbegrepen, max. 8 woorden, geen em-dashes",
    intro_hint="Directe opening. Geen generieke inleiding. De lezer begrijpt de invalshoek binnen de eerste 2 zinnen.",
    cover_hint="beschrijving van het gewenste beeld",
    content_hint="3 tot 5 ## secties met proza + afbeeldingsplaatshouder na elke sectie\n[Minimaal één concreet reisscenario in \"je\" — specifiek, niet generiek]\n[De sectie op ~60% van het artikel moet korter/anders zijn dan de andere — de \"jolt\"]",
    promo_title="Binnenkort op reis?",
    promo_cta="Bekijk plannen",
    promo_href="/plannen",
    promo_body="Activeer je eSIM in enkele minuten en blijf verbonden vanaf het moment van landing.",
    seo_title_hint="Primaire keyword aan het begin",
    seo_desc_hint="Keyword opnemen, duidelijke waardepropositie",
) + """
STRIKTE REGELS:
- Aantal woorden in de tekst: PRECIES 600-800 woorden (alleen post.content, zonder intro/takeaways/metadata)
- Taal: Alleen Nederlands. Gebruik "je" (informeel).
- Geen em-dashes (—) ergens. Vervang door komma, dubbele punt, haakjes of punt.
- PROMO-kaart moet de exacte volgorde hebben: title, ctaText, ctaHref — alleen rechte aanhalingstekens — CTA max. 3 woorden
- Nooit fictieve persona's ("Stel je Thomas voor...") — gebruik "je"
- Max. 2 ritmische drietallen in het hele artikel
- Max. 2 signposting-zinnen ("Goed nieuws:", "Met andere woorden:", "Daarom:", enz.)
- Max. 1 label-dubbele-punt-zin ("De simpele regel: ...")
- Geen zelfcommentaar-zinnen ("Laten we nu kijken naar", "We gaan over naar", "Laten we onderzoeken")
- Varieer de zinslengte agressief — na een lange zin een korte
- Concurrenten (Airalo, Holafly, Saily): kunnen worden genoemd indien feitelijk, nooit zonder verifieerbare basis gedenigreerd""",

"es": """Eres un redactor SEO senior para Kolet — una startup francesa de eSIM fundada por tres expertos en telecomunicaciones.
Tagline: "Mobile data for modern explorers". Tono: cálido, directo, ligeramente irreverente. El Robin Hood de las telecomunicaciones, no un operador corporativo.
Lector objetivo: Viajero internacional moderno que viaja con frecuencia y quiere conectividad sin estrés ni cargos ocultos.

Produce el artículo siguiendo EXACTAMENTE este formato de salida:
""" + _CMS_TEMPLATE.format(
    title_hint="Título corto e impactante, keyword incluida, máx. 8 palabras, sin guiones largos",
    intro_hint="Enganche inmediato. Sin preámbulo genérico. El lector entiende el ángulo en las primeras 2 frases.",
    cover_hint="descripción del visual deseado",
    content_hint="3 a 5 secciones ## con prosa + marcador de imagen después de cada sección\n[Al menos un escenario de viaje concreto en \"tú\" — específico, no genérico]\n[La sección al ~60% del artículo debe ser más corta/diferente — el \"jolt\"]",
    promo_title="¿Viajando pronto?",
    promo_cta="Ver planes",
    promo_href="/planes",
    promo_body="Activa tu eSIM en minutos y mantente conectado desde el momento en que aterrizas.",
    seo_title_hint="Keyword principal al inicio",
    seo_desc_hint="Incluir keyword, propuesta de valor clara",
) + """
REGLAS ESTRICTAS:
- Recuento de palabras en el cuerpo: EXACTAMENTE 600-800 palabras (solo post.content, sin intro/takeaways/metadata)
- Idioma: Solo español. Usa "tú" (informal).
- Sin guiones largos (—) en ningún lugar. Reemplaza con coma, dos puntos, paréntesis o punto.
- La tarjeta PROMO debe tener el orden exacto: title, ctaText, ctaHref — solo comillas rectas — CTA máx. 3 palabras
- Nunca uses personas ficticias ("Imagina a Thomas...") — usa "tú"
- Máx. 2 tripletes rítmicos en todo el artículo
- Máx. 2 frases de señalización ("Buenas noticias:", "En otras palabras:", "Por eso:", etc.)
- Máx. 1 frase de etiqueta-dos puntos ("La regla simple: ...")
- Sin frases de autocomentario ("veamos ahora", "pasemos a", "examinemos")
- Varía la longitud de las frases agresivamente — después de una larga, una corta
- Competidores (Airalo, Holafly, Saily): pueden nombrarse si son hechos, nunca denigrados sin base verificable""",

}

def get_system_prompt(lang: str) -> str:
    return SYSTEM_PROMPTS.get(lang, SYSTEM_PROMPTS["fr"])


PROMPT_ENGINEER_SYSTEM = """You are a visual prompt engineer for Higgsfield AI and GPT-Image-2.
Your job: transform a brief image description into a detailed, high-quality generation prompt for a travel eSIM brand article.

Rules:
- Describe the exact scene with specific visual details (what, where, mood, composition)
- If it is a photo: specify lighting, camera angle, color palette, and atmosphere
- If it is an infographic or diagram: describe the visual structure clearly (icons, arrows, layout, stages, hierarchy)
- Always include: modern, clean, travel-tech editorial design, high-resolution, 16:9 aspect ratio, suitable for an SEO blog article
- Keep it 2–4 sentences. No bullet points. No explanations. Output ONLY the prompt text."""


def build_image_prompt(title, zone="global"):
    dest = f"in {zone}" if zone not in ("global", "") else "at an international airport"
    return (
        f"Solo traveller {dest} checking their smartphone for data coverage, "
        "editorial travel photography, blue and white tones, natural light, "
        "photorealistic, 16:9, no text overlay, suitable for an SEO blog article."
    )


def _write_image_prompt(description: str, headline: str, zone: str) -> str:
    """Use LLM to write a high-quality Higgsfield prompt from a raw image description."""
    if not description or len(description.strip()) < 8:
        return build_image_prompt(headline, zone)

    user_msg = f"Article title: {headline}\nZone: {zone}\nImage description: {description}\n\nWrite the image generation prompt:"

    if GROQ_KEY:
        from groq import Groq
        from groq import RateLimitError as GroqRateLimitError
        client = Groq(api_key=GROQ_KEY)
        for model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]:
            try:
                msg = client.chat.completions.create(
                    model=model, max_tokens=250,
                    messages=[{"role": "system", "content": PROMPT_ENGINEER_SYSTEM},
                               {"role": "user", "content": user_msg}]
                )
                return msg.choices[0].message.content.strip()
            except GroqRateLimitError:
                continue
            except Exception:
                break

    # Fallback template if LLM unavailable
    return (
        f"Editorial travel-tech visual for a Kolet eSIM blog article. "
        f"Scene: {description}. "
        "Style: modern, minimal, clean typography, light background, blue and white palette. "
        "High-resolution, 16:9, suitable for an SEO blog article."
    )


def extract_image_prompts(text, headline, zone):
    """Return list of {placeholder, description, prompt} in article order."""
    seen = {}
    order = []

    # 1. Markdown image syntax: ![description](IMAGE_PLACEHOLDER_xxx)
    for m in re.finditer(r'!\[([^\]]*)\]\((IMAGE_PLACEHOLDER_[\w-]+)\)', text):
        desc, ph = m.group(1).strip(), m.group(2)
        if ph not in seen:
            seen[ph] = desc
            order.append(ph)

    # 2. Bracket notation: [IMAGE_PLACEHOLDER_xxx — description]
    for m in re.finditer(r'\[(IMAGE_PLACEHOLDER_[\w-]+)\s*[—\-]\s*([^\]]+)\]', text):
        ph, desc = m.group(1), m.group(2).strip()
        if ph not in seen:
            seen[ph] = desc
            order.append(ph)

    # 3. Bare with em-dash: IMAGE_PLACEHOLDER_xxx — description
    for m in re.finditer(r'(IMAGE_PLACEHOLDER_[\w-]+)\s*[—\-]\s*(.+)', text):
        ph, desc = m.group(1), m.group(2).strip()
        if ph not in seen:
            seen[ph] = desc
            order.append(ph)

    # 4. Bare placeholder with no description
    for m in re.finditer(r'IMAGE_PLACEHOLDER_[\w-]+', text):
        ph = m.group(0)
        if ph not in seen:
            seen[ph] = ""
            order.append(ph)

    EXCLUDED = {"IMAGE_PLACEHOLDER_author-avatar", "IMAGE_PLACEHOLDER_author_avatar"}
    result = []
    for ph in order:
        if ph in EXCLUDED:
            continue
        desc = seen.get(ph, "")
        skip_llm = "description du visuel" in desc.lower()
        prompt = build_image_prompt(headline, zone) if skip_llm else _write_image_prompt(desc, headline, zone)
        result.append({"placeholder": ph, "description": desc, "prompt": prompt})
    return result


def generate_image_sync(prompt, slug, idx):
    try:
        result = subprocess.run(
            [HIGGSFIELD_BIN, "generate", "create", "gpt_image_2",
             "--prompt", prompt, "--aspect_ratio", "16:9", "--wait"],
            capture_output=True, text=True, timeout=300
        )
        output = result.stdout + result.stderr
        url_match = re.search(r'https://\S+(?:\.jpg|\.png|\.webp|/image[^\s"\']*)', output)
        if not url_match:
            url_match = re.search(r'https://cdn\.higgsfield\S+', output)
        if not url_match:
            print(f"No image URL in Higgsfield output: {output[:300]}")
            return None
        image_url = url_match.group(0).rstrip(".,)")
        img_bytes = requests.get(image_url, timeout=60).content
        filename = f"{slug}-{idx}.jpg"
        path = IMAGES_DIR / filename
        path.write_bytes(img_bytes)
        return f"/api/images/{filename}"
    except Exception as e:
        print(f"Image generation failed: {e}")
        return None


BRIEF_SYSTEM = """You are a senior SEO content strategist for Kolet (eSIM travel brand).
Generate a concise content brief for the article. Write the brief in the same language as the article.
Reply ONLY in this exact format (keeping labels in the article language):

**Angle:** [One sentence — the specific angle and reader promise]

**Sections:**
1. **[H2 Title]** — [Key point this section makes]
2. **[H2 Title]** — [Key point this section makes]
3. **[H2 Title]** — ["Jolt" section — shorter, contrasting or surprising angle]
4. **[H2 Title]** — [Key point this section makes]

**PROMO angle:** [What the conversion CTA should emphasize]

**Image ideas:**
- Cover: [Visual description for hero image]
- Mid-article: [Visual description for inline image]"""


class BriefRequest(BaseModel):
    headline: str
    focus_keyword: str
    secondary_keywords: list = []
    content_format: str = "guide"
    kolet_angle: str = ""
    target_zone: str = "global"
    lang: str = "fr"


@router.post("/generate/brief")
def generate_brief(req: BriefRequest):
    """Generate a lightweight content brief (outline) before full article writing."""
    from fastapi import HTTPException as _HTTPException
    lang_labels = {"fr": "French", "en": "English", "de": "German", "nl": "Dutch", "es": "Spanish"}
    lang_label = lang_labels.get(req.lang, "English")

    user_msg = (
        f"Write the brief in {lang_label}.\n"
        f"Headline: {req.headline}\n"
        f"Primary keyword: {req.focus_keyword}\n"
        f"Secondary keywords: {', '.join(req.secondary_keywords)}\n"
        f"Content format: {req.content_format}\n"
        f"Target zone: {req.target_zone}\n"
        f"Kolet angle: {req.kolet_angle}\n\n"
        "Generate the content brief:"
    )

    brief_text = ""
    if GROQ_KEY:
        from groq import Groq, RateLimitError as GroqRateLimitError
        gc = Groq(api_key=GROQ_KEY)
        for model in ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]:
            try:
                msg = gc.chat.completions.create(
                    model=model, max_tokens=800,
                    messages=[{"role": "system", "content": BRIEF_SYSTEM},
                               {"role": "user", "content": user_msg}]
                )
                brief_text = msg.choices[0].message.content.strip()
                break
            except GroqRateLimitError:
                continue
    elif ANTHROPIC_KEY:
        import anthropic
        ac = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = ac.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=800,
            system=BRIEF_SYSTEM,
            messages=[{"role": "user", "content": user_msg}]
        )
        brief_text = msg.content[0].text.strip()

    if not brief_text:
        raise _HTTPException(503, detail="LLM unavailable — check API keys or rate limits")

    return {"brief": brief_text}


class GenerateRequest(BaseModel):
    topic_id: str
    headline: str
    focus_keyword: str
    secondary_keywords: list = []
    content_format: str = "guide"
    kolet_angle: str = ""
    word_count: int = 1200
    target_zone: str = "global"
    lang: str = "en"
    brief: str = ""


@router.post("/generate")
def generate_article(req: GenerateRequest):
    """Stream article generation as Server-Sent Events."""

    def event_stream():
        article_id = str(uuid.uuid4())[:8]

        yield f"data: {json.dumps({'type': 'status', 'message': 'Starting article generation...'})}\n\n"

        SYSTEM = get_system_prompt(req.lang)

        lang_labels = {"fr": "français", "en": "English", "de": "Deutsch", "nl": "Nederlands", "es": "Español"}
        lang_label  = lang_labels.get(req.lang, req.lang)

        prompt = f"""Write a complete SEO article for Kolet following EXACTLY the format defined in your system instructions.

Topic: {req.headline}
Primary keyword: {req.focus_keyword}
Secondary keywords: {', '.join(req.secondary_keywords)}
Content format: {req.content_format}
Target zone: {req.target_zone}
Kolet angle: {req.kolet_angle}
Language: {lang_label} — write the ENTIRE article in {lang_label}, including all headings, intro, takeaways, and SEO fields.

Critical reminders:
- Body word count: 600-800 words (post.content only)
- PROMO card with exact syntax required
- Follow all typography rules for {lang_label}"""

        if req.brief:
            prompt += f"\n\nContent brief to follow (use this as your structural guide):\n{req.brief}"

        writer = "Claude" if ANTHROPIC_KEY else "Llama (Groq)"
        yield f"data: {json.dumps({'type': 'status', 'message': f'{writer} is writing your article in {lang_label}...'})}\n\n"

        # Stream article
        full_text = ""
        GROQ_MODELS_GEN = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "gemma2-9b-it"]
        if ANTHROPIC_KEY:
            import anthropic
            ac = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
            with ac.messages.stream(
                model="claude-sonnet-4-6", max_tokens=6000,
                system=SYSTEM, messages=[{"role": "user", "content": prompt}],
            ) as stream:
                for text in stream.text_stream:
                    full_text += text
                    yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"
        elif GROQ_KEY:
            from groq import Groq
            from groq import RateLimitError as GroqRateLimitError
            gc = Groq(api_key=GROQ_KEY)
            streamed = False
            for model in GROQ_MODELS_GEN:
                if streamed:
                    break
                try:
                    stream = gc.chat.completions.create(
                        model=model, max_tokens=6000, stream=True,
                        messages=[{"role": "system", "content": SYSTEM},
                                  {"role": "user", "content": prompt}]
                    )
                    yield f"data: {json.dumps({'type': 'status', 'message': f'Writing with {model}...'})}\n\n"
                    for chunk in stream:
                        text = chunk.choices[0].delta.content or ""
                        if text:
                            full_text += text
                            yield f"data: {json.dumps({'type': 'chunk', 'text': text})}\n\n"
                    streamed = True
                except GroqRateLimitError as e:
                    import re as _re
                    m = _re.search(r'try again in ([^\.\n]+)', str(e))
                    wait = f" Try again in {m.group(1)}." if m else ""
                    yield f"data: {json.dumps({'type': 'status', 'message': f'{model} rate-limited, trying next...{wait}'})}\n\n"
                    continue
            if not streamed:
                yield f"data: {json.dumps({'type': 'error', 'message': 'All Groq models rate-limited. Please wait and retry.'})}\n\n"
                return
        else:
            yield f"data: {json.dumps({'type': 'error', 'message': 'No LLM API key configured.'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'status', 'message': 'Saving article...'})}\n\n"

        slug = re.sub(r"[^a-z0-9]+", "-", req.headline.lower()).strip("-")[:40]

        # Extract title from POST TITLE field
        title_match = re.search(r'POST TITLE[^\n]*:\n([^\n═]+)', full_text)
        title = title_match.group(1).strip() if title_match else req.headline

        # Persist to DB (no images yet)
        conn = get_conn()
        conn.execute(
            """INSERT INTO articles
               (id, topic_id, title, slug, lang, focus_keyword, target_zone,
                status, content, meta_description, images)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (article_id, req.topic_id, title, slug, req.lang, req.focus_keyword,
             req.target_zone, "draft", full_text, "", json.dumps([]))
        )
        conn.execute("UPDATE topics SET status='written' WHERE id=?", (req.topic_id,))
        conn.commit()
        conn.close()

        # Extract image prompts for user approval (images generated in separate call)
        image_prompts = extract_image_prompts(full_text, req.headline, req.target_zone)

        yield f"data: {json.dumps({'type': 'done', 'article_id': article_id, 'title': title, 'image_prompts': image_prompts})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


class GenerateImagesRequest(BaseModel):
    prompts: list  # [{placeholder, prompt}]


@router.post("/articles/{article_id}/generate-images")
def generate_article_images(article_id: str, req: GenerateImagesRequest):
    """Stream image generation for an already-written article. Caller passes approved prompts."""

    def event_stream():
        conn = get_conn()
        row = conn.execute("SELECT slug FROM articles WHERE id = ?", (article_id,)).fetchone()
        conn.close()
        if not row:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Article not found'})}\n\n"
            return

        slug = row["slug"] or article_id
        image_urls = []
        total = len(req.prompts)

        for i, item in enumerate(req.prompts):
            ph     = item.get("placeholder", f"img-{i}")
            prompt = item.get("prompt", "")
            yield f"data: {json.dumps({'type': 'status', 'message': f'Generating image {i+1}/{total}...'})}\n\n"
            url = generate_image_sync(prompt, slug, i)
            if url:
                image_urls.append(url)
                yield f"data: {json.dumps({'type': 'image', 'url': url, 'index': i, 'placeholder': ph})}\n\n"

        # Update DB with generated images
        conn = get_conn()
        conn.execute("UPDATE articles SET images=? WHERE id=?", (json.dumps(image_urls), article_id))
        conn.commit()
        conn.close()

        yield f"data: {json.dumps({'type': 'images_done', 'images': image_urls})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
