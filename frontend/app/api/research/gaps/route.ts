import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const TOPIC_MAP: Record<string, { topic: string; search: string[] }[]> = {
  Destinations: [
    { topic: 'Japan',       search: ['japan','japon','japón'] },
    { topic: 'USA',         search: ['usa','états-unis','estados unidos','united states','amérique'] },
    { topic: 'Europe',      search: ['europe','europa'] },
    { topic: 'Thailand',    search: ['thailand','thaïlande','tailandia'] },
    { topic: 'UK',          search: ['royaume-uni','united kingdom','großbritannien','reino unido','angleterre'] },
    { topic: 'Australia',   search: ['australia','australie'] },
    { topic: 'Canada',      search: ['canada'] },
    { topic: 'UAE / Dubai', search: ['émirats','emirates','dubai','dubaï'] },
    { topic: 'Mexico',      search: ['mexique','mexico','mexiko'] },
    { topic: 'South Korea', search: ['corée','korea','corea'] },
    { topic: 'Singapore',   search: ['singapour','singapore'] },
    { topic: 'Italy',       search: ['italie','italy','italien','italia'] },
    { topic: 'Spain',       search: ['espagne','spain','spanien','españa'] },
    { topic: 'Morocco',     search: ['maroc','morocco','marokko','marruecos'] },
    { topic: 'Turkey',      search: ['turquie','turkey','türkei','turquía'] },
    { topic: 'Vietnam',     search: ['vietnam'] },
    { topic: 'Indonesia',   search: ['indonésie','indonesia'] },
    { topic: 'India',       search: ['inde','india','indien'] },
    { topic: 'Portugal',    search: ['portugal'] },
    { topic: 'Greece',      search: ['grèce','greece','griechenland','grecia'] },
  ],
  'Use Cases': [
    { topic: 'Digital Nomad',   search: ['nomade digital','digital nomad'] },
    { topic: 'Business Travel', search: ['voyage affaires','business travel'] },
    { topic: 'Family Travel',   search: ['famille','family travel','familienreise'] },
    { topic: 'Backpacker',      search: ['routard','backpacker'] },
    { topic: 'Cruise',          search: ['croisière','cruise','kreuzfahrt','crucero'] },
    { topic: 'Long Stay',       search: ['long séjour','long stay','expatrié','expat'] },
    { topic: 'Student Travel',  search: ['étudiant','student','estudiante'] },
  ],
  'Comparisons & Value': [
    { topic: 'eSIM vs Roaming',   search: ['vs roaming','versus roaming','frais roaming'] },
    { topic: 'eSIM vs Local SIM', search: ['vs carte sim','vs local sim','sim locale'] },
    { topic: 'Cheap eSIM',        search: ['pas cher','cheap','günstig','barata'] },
    { topic: 'Best eSIM',         search: ['meilleure esim','best esim','beste esim','mejor esim'] },
    { topic: 'eSIM Comparison',   search: ['comparatif','comparison','vergleich','comparativa'] },
  ],
  Technical: [
    { topic: 'How to Install',    search: ['installer','install','installieren','instalar'] },
    { topic: 'Compatible Phones', search: ['téléphone compatible','compatible phone','kompatibel'] },
    { topic: 'eSIM on iPhone',    search: ['iphone'] },
    { topic: 'eSIM on Android',   search: ['android'] },
    { topic: 'Activation Issues', search: ['problème','not working','troubleshoot'] },
    { topic: 'eSIM Setup Guide',  search: ['configuration','setup guide','einrichtung','configuración'] },
  ],
};

export async function GET() {
  const rows = await sql`SELECT id, title, focus_keyword, lang FROM articles`;
  const articles = rows as any[];

  function isCovered(terms: string[]) {
    return articles.filter(a => {
      const hay = `${a.title || ''} ${a.focus_keyword || ''}`.toLowerCase();
      return terms.some(t => hay.includes(t.toLowerCase()));
    }).map(a => ({ id: a.id, title: a.title, lang: a.lang }));
  }

  let total = 0, covered = 0;
  const categories = Object.entries(TOPIC_MAP).map(([name, topics]) => ({
    name,
    topics: topics.map(entry => {
      const hits = isCovered(entry.search);
      total++;
      if (hits.length) covered++;
      return { topic: entry.topic, article_count: hits.length, langs: [...new Set(hits.map((h: any) => h.lang))], articles: hits.slice(0, 3) };
    }),
  }));

  return NextResponse.json({ categories, total_topics: total, covered_count: covered, gap_count: total - covered });
}
