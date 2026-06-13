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

SYSTEM = """Tu es rédacteur SEO senior pour Kolet — une startup eSIM française fondée par trois experts télécom.
Tagline : "Mobile data for modern explorers". Ton : chaleureux, direct, légèrement impertinent. Robin Hood de la télécom, pas un opérateur corporate.
Lecteur cible : voyageur français moderne qui voyage régulièrement et veut de la connectivité sans stress ni frais cachés.

Tu dois produire l'article en suivant EXACTEMENT ce format de sortie :

═══════════════════════════════════════════════
CMS FIELDS (outside post.content)
═══════════════════════════════════════════════

POST TITLE:
[Titre court, percutant, mot-clé inclus, 8 mots MAX, zéro tiret long]

READ TIME:
[X min]

INTRO (post.intro — 50 mots max):
[Accroche immédiate. Pas de préambule générique. Le lecteur comprend l'angle dès les 2 premières phrases.]

KEY TAKEAWAYS (3-4 bullet points max):
- [Insight concret et autonome]
- [Insight concret et autonome]
- [Insight concret et autonome]

COVER IMAGE:
[IMAGE_PLACEHOLDER_cover — description du visuel souhaité]

═══════════════════════════════════════════════
POST CONTENT (post.content — markdown body)
═══════════════════════════════════════════════

[3 à 5 sections ## avec prose + image placeholder après chaque section]
[Au moins un scénario de voyage concret en "vous" — spécifique, pas générique]
[La section à ~60% de l'article doit être plus courte/différente des autres — le "jolt"]

Après les sections, dans cet ordre exact :

---

> [!PROMO title="Vous partez bientôt ?" ctaText="Voir les forfaits" ctaHref="/forfaits"]
> Activez votre eSIM en quelques minutes et restez connecté dès l'atterrissage.

---

## FAQ

[4 à 6 questions ### reflétant de vraies requêtes de recherche. Réponses en prose, pas de listes imbriquées.]

---

## À propos de l'auteur

![Photo de Kaustubh Lahoty](IMAGE_PLACEHOLDER_author-avatar)

**Kaustubh Lahoty** — CRM Manager chez Kolet

Kaustubh écrit pour aider les voyageurs français à choisir leur connectivité mobile à l'étranger, sans jargon ni mauvaises surprises sur la facture.

[LinkedIn ↗](https://www.linkedin.com/in/kaustubh-lahoty/){target="_blank" rel="noopener noreferrer"} | [Tous ses articles →](https://www.kolet.com/blog/auteur/kaustubh-lahoty)

---

## Articles liés

- [Titre article lié 1](https://www.kolet.com/blog/[slug-1])
- [Titre article lié 2](https://www.kolet.com/blog/[slug-2])

═══════════════════════════════════════════════
SEO METADATA
═══════════════════════════════════════════════

SEO TITLE (60 chars max):
[Mot-clé principal en début]

SEO DESCRIPTION (155 chars max):
[Inclut mot-clé, proposition de valeur claire]

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
- Concurrents (Airalo, Holafly, Saily) : nommables si factuel, jamais dénigrés sans base vérifiable"""


def build_image_prompt(title, zone="global"):
    dest = f"in {zone}" if zone not in ("global", "") else "at an international airport"
    return (
        f"Solo traveller {dest} holding a smartphone, editorial travel photography, "
        "blue and white tones, natural light, photorealistic, no text, 16:9"
    )


def extract_image_prompts(text, headline, zone):
    """Return list of {placeholder, prompt} in article order, one per IMAGE_PLACEHOLDER_xxx."""
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

    # 3. Bare with em-dash: IMAGE_PLACEHOLDER_xxx — description (rest of line)
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
    fallback = build_image_prompt(headline, zone)
    result = []
    for ph in order:
        if ph in EXCLUDED:
            continue
        desc = seen.get(ph, "")
        if desc and "description du visuel" not in desc.lower() and len(desc) > 5:
            prompt = (
                f"Travel editorial photo for Kolet eSIM article. Scene: {desc}. "
                "Style: blue and white tones, natural light, photorealistic, 16:9, no text overlay."
            )
        else:
            prompt = fallback
        result.append({"placeholder": ph, "prompt": prompt})
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


@router.post("/generate")
def generate_article(req: GenerateRequest):
    """Stream article generation as Server-Sent Events."""

    def event_stream():
        article_id = str(uuid.uuid4())[:8]

        yield f"data: {json.dumps({'type': 'status', 'message': 'Starting article generation...'})}\n\n"

        prompt = f"""Écris un article SEO complet pour Kolet en suivant EXACTEMENT le format défini dans tes instructions système.

Sujet : {req.headline}
Mot-clé principal : {req.focus_keyword}
Mots-clés secondaires : {', '.join(req.secondary_keywords)}
Format de contenu : {req.content_format}
Zone géographique cible : {req.target_zone}
Angle Kolet : {req.kolet_angle}

Rappels critiques :
- Corps de l'article (post.content) : 600 à 800 mots
- Langue : français, "vous", zéro tiret long
- PROMO card avec syntaxe exacte obligatoire
- FAQ : 4 à 6 questions
- Auteur : Kaustubh Lahoty — CRM Manager chez Kolet
- &nbsp; avant ? ! : dans les titres et l'intro"""

        writer = "Claude" if ANTHROPIC_KEY else "Llama (Groq)"
        yield f"data: {json.dumps({'type': 'status', 'message': f'{writer} is writing your article...'})}\n\n"

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
